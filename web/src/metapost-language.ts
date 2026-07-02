import { cppLanguage } from "@codemirror/lang-cpp";
import { LanguageSupport, LRLanguage } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import type { Text } from "@codemirror/state";
import { Prec, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import { findMpKeywordMatches, isMpKeyword, MP_KEYWORD_GROUPS, rangesOverlap } from "./mp-keywords";
import { darkSyntaxHighlight } from "./syntax-theme";

const commentClass = "cm-mp-comment";

export type MetaPostRegion = {
  from: number;
  to: number;
  kind: "mpostfig" | "mpostdef";
};

export const metapostLanguage = LRLanguage.define({
  name: "metapost",
  parser: cppLanguage.parser,
  languageData: {
    ...cppLanguage.data,
    commentTokens: { line: "%" },
    closeBrackets: { brackets: ["(", "[", "{"] },
  },
});

const metapostThemeRules: Record<string, { color: string; fontStyle?: string; fontWeight?: string }> = {
  [commentClass]: { color: "#697098", fontStyle: "italic" },
  "cm-mp-kw-def": { color: "#c792ea", fontWeight: "500" },
  "cm-mp-kw-tex": { color: "#ffcb6b", fontWeight: "500" },
  "cm-mp-kw-fig": { color: "#82aaff", fontWeight: "500" },
  "cm-mp-kw-group": { color: "#c792ea", fontWeight: "500" },
  "cm-mp-kw-control": { color: "#89ddff", fontWeight: "500" },
  "cm-mp-kw-draw": { color: "#7fd4c1", fontWeight: "500" },
};

const metapostTheme = EditorView.theme(
  Object.fromEntries(
    Object.entries(metapostThemeRules).map(([sel, style]) => [
      `.cm-editor .${sel}`,
      style,
    ]),
  ),
);

function keywordStyleAttr(className: string): string | undefined {
  const rule = metapostThemeRules[className];
  if (!rule) return undefined;
  const parts = [`color: ${rule.color}`];
  if (rule.fontStyle) parts.push(`font-style: ${rule.fontStyle}`);
  if (rule.fontWeight) parts.push(`font-weight: ${rule.fontWeight}`);
  return parts.join("; ");
}

function keywordMark(className: string): Decoration {
  const style = keywordStyleAttr(className);
  return Decoration.mark({
    class: className,
    ...(style ? { attributes: { style } } : {}),
  });
}

/** mpostinl 中 \begin{mpostfig|mpostdef}…\end{…} 内的 MetaPost 正文区间 */
export function findMetaPostRegions(doc: Text): MetaPostRegion[] {
  const text = doc.toString();
  const regions: MetaPostRegion[] = [];
  const beginRe = /\\begin\{(mpostfig|mpostdef)\}(?:\[[^\]]*\])?/g;
  let match: RegExpExecArray | null;
  while ((match = beginRe.exec(text))) {
    const kind = match[1] as MetaPostRegion["kind"];
    const endTag = `\\end{${kind}}`;
    const endIdx = text.indexOf(endTag, match.index + match[0].length);
    if (endIdx < 0) continue;
    let contentStart = text.indexOf("\n", match.index + match[0].length);
    if (contentStart < 0) contentStart = match.index + match[0].length;
    else contentStart += 1;
    let contentEnd = endIdx;
    while (contentEnd > contentStart && (text[contentEnd - 1] === "\n" || text[contentEnd - 1] === "\r")) {
      contentEnd--;
    }
    if (contentStart < contentEnd) {
      regions.push({ from: contentStart, to: contentEnd, kind });
    }
  }
  return regions;
}

function intersects(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo;
}

function findCommentStart(text: string): number {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inString && text[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString && ch === "%") return i;
  }
  return -1;
}

type KeywordSpan = { from: number; to: number };

function collectKeywordSpans(
  doc: Text,
  viewFrom: number,
  viewTo: number,
  regions: MetaPostRegion[] | null,
): { decorations: DecorationSet; spans: KeywordSpan[] } {
  const marks = [];
  const spans: KeywordSpan[] = [];
  const scope =
    regions && regions.length > 0
      ? regions
      : [{ from: 0, to: doc.length, kind: "mpostfig" as const }];

  let pos = viewFrom;
  while (pos <= viewTo) {
    const line = doc.lineAt(pos);
    const lineFrom = line.from;
    const lineTo = line.to;
    if (!scope.some((r) => intersects(lineFrom, lineTo, r.from, r.to))) {
      pos = line.to + 1;
      continue;
    }
    const text = line.text;
    const regionEnd = scope
      .filter((r) => intersects(lineFrom, lineTo, r.from, r.to))
      .reduce((max, r) => Math.max(max, Math.min(lineTo, r.to)), lineFrom);
    const regionStart = scope
      .filter((r) => intersects(lineFrom, lineTo, r.from, r.to))
      .reduce((min, r) => Math.min(min, Math.max(lineFrom, r.from)), lineTo);

    const sliceStart = Math.max(0, regionStart - lineFrom);
    const sliceEnd = Math.min(text.length, regionEnd - lineFrom);
    const slice = text.slice(sliceStart, sliceEnd);

    const commentAt = findCommentStart(slice);
    if (commentAt >= 0) {
      marks.push(
        Decoration.mark({ class: commentClass }).range(
          lineFrom + sliceStart + commentAt,
          lineFrom + sliceEnd,
        ),
      );
    }
    const scanEnd = commentAt >= 0 ? commentAt : slice.length;
    for (const kw of findMpKeywordMatches(slice, scanEnd)) {
      const start = lineFrom + sliceStart + kw.from;
      const end = lineFrom + sliceStart + kw.to;
      spans.push({ from: start, to: end });
      marks.push(
        keywordMark(kw.className).range(start, end),
      );
    }
    pos = line.to + 1;
  }
  return {
    decorations: marks.length ? Decoration.set(marks, true) : Decoration.none,
    spans,
  };
}

function overlapsKeywordSpans(from: number, to: number, spans: KeywordSpan[]): boolean {
  return spans.some((span) => rangesOverlap(from, to, span.from, span.to));
}

function tokenIsMpKeyword(slice: string, from: number, to: number): boolean {
  return isMpKeyword(slice.slice(from, to));
}

function buildParserDecorations(
  doc: Text,
  viewFrom: number,
  viewTo: number,
  regions: MetaPostRegion[] | null,
  keywordSpans: KeywordSpan[],
): DecorationSet {
  const scope =
    regions && regions.length > 0
      ? regions
      : [{ from: 0, to: doc.length, kind: "mpostfig" as const }];
  const marks: ReturnType<Decoration["range"]>[] = [];
  const markCache: Record<string, Decoration> = {};

  for (const region of scope) {
    if (!intersects(viewFrom, viewTo, region.from, region.to)) continue;
    const slice = doc.sliceString(region.from, region.to);
    const tree = metapostLanguage.parser.parse(slice);
    highlightTree(
      tree,
      darkSyntaxHighlight,
      (from, to, style) => {
        if (!style) return;
        const absFrom = region.from + from;
        const absTo = region.from + to;
        if (!intersects(viewFrom, viewTo, absFrom, absTo)) return;
        if (overlapsKeywordSpans(absFrom, absTo, keywordSpans)) return;
        if (tokenIsMpKeyword(slice, from, to)) return;
        const mark = markCache[style] ?? (markCache[style] = Decoration.mark({ class: style }));
        const rangeFrom = Math.max(absFrom, viewFrom);
        const rangeTo = Math.min(absTo, viewTo);
        if (rangeFrom < rangeTo) marks.push(mark.range(rangeFrom, rangeTo));
      },
      Math.max(0, viewFrom - region.from),
      Math.min(slice.length, viewTo - region.from),
    );
  }

  return marks.length ? Decoration.set(marks, true) : Decoration.none;
}

function mergeDecorationSets(a: DecorationSet, b: DecorationSet): DecorationSet {
  if (a === Decoration.none) return b;
  if (b === Decoration.none) return a;
  const merged: ReturnType<Decoration["range"]>[] = [];
  a.between(0, Number.MAX_SAFE_INTEGER, (from, to, value) => {
    merged.push(value.range(from, to));
  });
  b.between(0, Number.MAX_SAFE_INTEGER, (from, to, value) => {
    merged.push(value.range(from, to));
  });
  return merged.length ? Decoration.set(merged, true) : Decoration.none;
}

function createMetaPostHighlightPlugin(getRegions: (doc: Text) => MetaPostRegion[] | null): Extension {
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
        const regions = getRegions(view.state.doc);
        const doc = view.state.doc;
        let combined = Decoration.none;
        for (const { from, to } of view.visibleRanges) {
          const { decorations: kw, spans } = collectKeywordSpans(doc, from, to, regions);
          const parsed = buildParserDecorations(doc, from, to, regions, spans);
          combined = mergeDecorationSets(combined, mergeDecorationSets(parsed, kw));
        }
        return combined;
      }
    },
    { decorations: (plugin) => plugin.decorations },
    ),
  );
}

const metapostHighlightPlugin = createMetaPostHighlightPlugin(() => null);

export function metapost(): Extension[] {
  return [new LanguageSupport(metapostLanguage), metapostTheme, metapostHighlightPlugin];
}

export function metaPostOverlayForRegions(getRegions: (doc: Text) => MetaPostRegion[]): Extension[] {
  return [metapostTheme, createMetaPostHighlightPlugin(getRegions)];
}

// re-export for theme tooling / docs
export { MP_KEYWORD_GROUPS };
