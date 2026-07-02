import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import type { CompileDiagnostic } from "./api";

export const setCompileDiagnosticsEffect = StateEffect.define<CompileDiagnostic[]>();

const compileDiagnosticsField = StateField.define<CompileDiagnostic[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCompileDiagnosticsEffect)) return effect.value;
    }
    return value;
  },
});

function toEditorDiagnostics(view: EditorView, items: CompileDiagnostic[]): Diagnostic[] {
  const doc = view.state.doc;
  return items.map((item) => {
    const lineNo = Math.max(1, Math.min(item.line, doc.lines));
    const line = doc.line(lineNo);
    const from = item.column != null ? line.from + Math.max(0, item.column - 1) : line.from;
    const to = item.column != null ? Math.min(line.to, from + 1) : line.to;
    return {
      from,
      to: Math.max(from + 1, to),
      severity: item.severity === "warning" ? "warning" : "error",
      message: item.message,
    };
  });
}

export function compileDiagnosticsExtension(): Extension {
  return [
    compileDiagnosticsField,
    linter((view) => toEditorDiagnostics(view, view.state.field(compileDiagnosticsField))),
    lintGutter(),
  ];
}

export function setCompileDiagnostics(view: EditorView, diagnostics: CompileDiagnostic[]): void {
  view.dispatch({ effects: setCompileDiagnosticsEffect.of(diagnostics) });
}

export function clearCompileDiagnostics(view: EditorView): void {
  setCompileDiagnostics(view, []);
}
