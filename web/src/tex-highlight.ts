import type { Text } from "@codemirror/state";
import { Prec, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

const texTheme = EditorView.theme({
  ".cm-tex-command": { color: "#c792ea", fontWeight: "500" },
  ".cm-tex-comment": { color: "#697098", fontStyle: "italic" },
});

const commandMark = Decoration.mark({ class: "cm-tex-command" });
const commentMark = Decoration.mark({ class: "cm-tex-comment" });

export type TexHighlightMatch = {
  from: number;
  to: number;
  className: "cm-tex-command" | "cm-tex-comment";
};

function findTexCommentStart(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "%") continue;
    let slashCount = 0;
    for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) slashCount++;
    if (slashCount % 2 === 0) return i;
  }
  return -1;
}

export function findTexHighlightMatches(line: string): TexHighlightMatch[] {
  const matches: TexHighlightMatch[] = [];
  const commentAt = findTexCommentStart(line);
  const scanEnd = commentAt >= 0 ? commentAt : line.length;
  const commandRe = /\\(?:[A-Za-z@]+|.)/g;
  let m: RegExpExecArray | null;
  while ((m = commandRe.exec(line)) && m.index < scanEnd) {
    matches.push({
      from: m.index,
      to: Math.min(m.index + m[0].length, scanEnd),
      className: "cm-tex-command",
    });
  }
  if (commentAt >= 0) {
    matches.push({ from: commentAt, to: line.length, className: "cm-tex-comment" });
  }
  return matches;
}

function buildTexDecorations(doc: Text, from: number, to: number): DecorationSet {
  const marks: ReturnType<Decoration["range"]>[] = [];
  let pos = from;
  while (pos <= to) {
    const line = doc.lineAt(pos);
    for (const match of findTexHighlightMatches(line.text)) {
      const mark = match.className === "cm-tex-comment" ? commentMark : commandMark;
      marks.push(mark.range(line.from + match.from, line.from + match.to));
    }
    pos = line.to + 1;
  }
  return marks.length ? Decoration.set(marks, true) : Decoration.none;
}

function createTexHighlightPlugin(): Extension {
  return Prec.highest(
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = this.build(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.build(update.view);
          }
        }

        build(view: EditorView): DecorationSet {
          let combined = Decoration.none;
          for (const { from, to } of view.visibleRanges) {
            const current = buildTexDecorations(view.state.doc, from, to);
            if (combined === Decoration.none) combined = current;
            else if (current !== Decoration.none) {
              const merged: ReturnType<Decoration["range"]>[] = [];
              combined.between(0, Number.MAX_SAFE_INTEGER, (a, b, value) => {
                merged.push(value.range(a, b));
              });
              current.between(0, Number.MAX_SAFE_INTEGER, (a, b, value) => {
                merged.push(value.range(a, b));
              });
              combined = Decoration.set(merged, true);
            }
          }
          return combined;
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  );
}

export function texHighlight(): Extension[] {
  return [texTheme, createTexHighlightPlugin()];
}
