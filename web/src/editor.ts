import { latex } from "codemirror-lang-latex";
import "codemirror-lang-latex/dist/latex.css";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  drawSelection,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

import { metapost } from "./metapost-language";
import { mpostinl } from "./mpostinl-language";
import { syntaxHighlightExtension } from "./syntax-theme";
import { texHighlight } from "./tex-highlight";

export type EditorLanguage = "metapost" | "latex" | "mpostinl";

const setLineHighlightsEffect = StateEffect.define<number[]>();

const lineHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setLineHighlightsEffect)) {
        deco = buildLineHighlightDecorations(tr.state.doc, effect.value);
      }
    }
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildLineHighlightDecorations(doc: EditorView["state"]["doc"], lineIndices: number[]): DecorationSet {
  const marks = [];
  for (const idx of lineIndices) {
    const lineNo = idx + 1;
    if (lineNo < 1 || lineNo > doc.lines) continue;
    const line = doc.line(lineNo);
    marks.push(Decoration.line({ class: "cm-shapeHighlight" }).range(line.from));
  }
  return marks.length ? Decoration.set(marks) : Decoration.none;
}

export const lineHighlightExtension: Extension = lineHighlightField;

export function setEditorLineHighlights(view: EditorView, lineIndices: number[]): void {
  view.dispatch({
    effects: setLineHighlightsEffect.of(lineIndices),
  });
}

export function clearEditorLineHighlights(view: EditorView): void {
  setEditorLineHighlights(view, []);
}

export function scrollEditorToLine(view: EditorView, lineIndex: number): void {
  const lineNo = lineIndex + 1;
  if (lineNo < 1 || lineNo > view.state.doc.lines) return;
  const line = view.state.doc.line(lineNo);
  view.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    color: "#e8edf4",
    backgroundColor: "#1a2332",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.5",
  },
  ".cm-content": {
    caretColor: "#5eb3ff",
  },
  "&.cm-focused .cm-cursor": {
    borderLeft: "2px solid #5eb3ff",
    marginLeft: "-1px",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(61, 139, 253, 0.35) !important",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(61, 139, 253, 0.25) !important",
  },
  ".cm-gutters": {
    backgroundColor: "#141c28",
    color: "#8fa3bf",
    borderRight: "1px solid #2d3f56",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#1e2a3a",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(30, 42, 58, 0.55)",
  },
  ".cm-line": {
    padding: "0 2px",
  },
  ".cm-line.cm-shapeHighlight": {
    backgroundColor: "rgba(94, 179, 255, 0.14)",
    boxShadow: "inset 3px 0 0 #5eb3ff",
  },
  ".cm-activeLine.cm-shapeHighlight": {
    backgroundColor: "rgba(94, 179, 255, 0.22)",
  },
  ".cm-lintRange-error": {
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='m0 3 l3 -3 l3 3' fill='none' stroke='%23ff6b6b' stroke-width='1.2'/%3E%3C/svg%3E\")",
    backgroundRepeat: "repeat-x",
    backgroundPosition: "left bottom",
    paddingBottom: "2px",
  },
  ".cm-lint-marker-error": {
    content: "''",
  },
  ".cm-tooltip-lint": {
    backgroundColor: "#111827",
    color: "#e8edf4",
    border: "1px solid #334155",
    borderRadius: "6px",
    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.35)",
  },
  ".cm-tooltip-lint .cm-diagnostic": {
    padding: "6px 8px",
  },
  ".cm-tooltip-lint .cm-diagnosticText": {
    color: "#e8edf4",
  },
});

function languageExtension(language: EditorLanguage, readonly: boolean): Extension | Extension[] {
  if (language === "latex") {
    return [
      latex({
        enableLinting: false,
        enableAutocomplete: !readonly,
        enableTooltips: !readonly,
        autoCloseTags: !readonly,
        autoCloseBrackets: !readonly,
      }),
      ...texHighlight(),
    ];
  }
  if (language === "mpostinl") {
    return mpostinl(readonly);
  }
  return metapost();
}

function baseExtensions(
  language: EditorLanguage,
  readonly: boolean,
  extra: Extension[] = [],
): Extension[] {
  const lang = languageExtension(language, readonly);
  const useGlobalSyntax = language === "latex" || language === "mpostinl";
  const extensions: Extension[] = [
    lineNumbers(),
    drawSelection(),
    ...(useGlobalSyntax ? [syntaxHighlightExtension] : []),
    ...(Array.isArray(lang) ? lang : [lang]),
    editorTheme,
    ...extra,
  ];
  if (!readonly) {
    extensions.splice(2, 0, history(), keymap.of([...defaultKeymap, ...historyKeymap]));
    extensions.push(lineHighlightExtension);
  }
  return extensions;
}

export function createEditor(
  parent: HTMLElement,
  initial: string,
  onChange?: (value: string) => void,
  language: EditorLanguage = "metapost",
  extraExtensions: Extension[] = [],
): EditorView {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && onChange) {
      onChange(update.state.doc.toString());
    }
  });

  const state = EditorState.create({
    doc: initial,
    extensions: [...baseExtensions(language, false, extraExtensions), updateListener],
  });

  return new EditorView({ state, parent });
}

export function getEditorValue(view: EditorView): string {
  return view.state.doc.toString();
}

export function setEditorValue(view: EditorView, value: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}

/** 只读源码预览（导出 .mp / mpostinl 等） */
export function createReadonlyEditor(
  parent: HTMLElement,
  initial: string,
  language: EditorLanguage = "metapost",
): EditorView {
  const state = EditorState.create({
    doc: initial,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      ...baseExtensions(language, true),
    ],
  });

  return new EditorView({ state, parent });
}
