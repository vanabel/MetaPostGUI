import { appendModifiers } from "./modifiers";
import type { ShapeStyle } from "./types";

/** MetaPost 路径整体需包在一对括号内，再跟 scaled u。 */
export function wrapMpPath(inner: string): string {
  const body = inner.trim();
  if (body.startsWith("(") && isWholeWrappedInParens(body)) return body;
  return `(${body})`;
}

export function isWholeWrappedInParens(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") depth--;
    if (depth === 0 && i < t.length - 1) return false;
  }
  return depth === 0;
}

export function peelOuterParens(s: string): string {
  let t = s.trim();
  while (isWholeWrappedInParens(t)) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

export function stripScaledU(s: string): string {
  return s.replace(/\s+scaled\s+u\s*$/i, "").trim();
}

/** 从 draw/filldraw 语句取出路径主体（已去 scaled u、去最外层括号）。 */
export function extractDrawPathBody(core: string): string | null {
  const m = core.match(/^(?:draw|filldraw)\s+(.+)$/i);
  if (!m) return null;
  return peelOuterParens(stripScaledU(m[1]));
}

export function emitScaledPath(
  op: string,
  pathInner: string,
  style?: ShapeStyle,
): string[] {
  const base = `${op} ${wrapMpPath(pathInner)} scaled u`;
  return appendModifiers(base, style);
}

/** Split path on `--` at parenthesis depth 0. */
export function splitOnDoubleDash(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && s[i] === "-" && s[i + 1] === "-") {
      parts.push(s.slice(start, i).trim());
      start = i + 2;
      i++;
    }
  }
  parts.push(s.slice(start).trim());
  return parts.filter(Boolean);
}

/** Split on `..` at parenthesis depth 0. */
export function splitOnDoubleDot(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && ch === "." && s[i + 1] === ".") {
      parts.push(s.slice(start, i).trim());
      start = i + 2;
      i++;
    }
  }
  parts.push(s.slice(start).trim());
  return parts.filter(Boolean);
}
