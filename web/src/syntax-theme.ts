import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** 暗色编辑器下的 CodeMirror 语法配色 */
export const darkSyntaxHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier], color: "#c792ea" },
  { tag: [t.operatorKeyword, t.self, t.null], color: "#89ddff" },
  { tag: [t.string, t.character, t.special(t.string)], color: "#c3e88d" },
  { tag: [t.number, t.bool, t.literal], color: "#f78c6c" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#697098", fontStyle: "italic" },
  { tag: [t.variableName, t.propertyName], color: "#e8edf4" },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: "#82aaff" },
  { tag: [t.typeName, t.className, t.namespace, t.labelName], color: "#ffcb6b" },
  { tag: [t.operator, t.arithmeticOperator, t.logicOperator, t.compareOperator, t.definitionOperator], color: "#89ddff" },
  { tag: [t.paren, t.brace, t.squareBracket, t.angleBracket, t.separator], color: "#a6accd" },
  { tag: [t.processingInstruction, t.macroName], color: "#c792ea" },
  { tag: t.meta, color: "#697098" },
  { tag: t.invalid, color: "#ff5370" },
]);

export const syntaxHighlightExtension = syntaxHighlighting(darkSyntaxHighlight);
