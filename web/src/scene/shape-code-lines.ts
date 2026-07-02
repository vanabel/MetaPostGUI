import { emitPrimitive } from "./emit";
import type { Shape } from "./types";

/** Normalize a MetaPost source line for fuzzy comparison. */
export function normalizeMpLine(s: string): string {
  return s.trim().replace(/;\s*$/, "").replace(/\s+/g, " ");
}

/** Text fragments that identify this shape in figure source. */
export function needlesForShape(shape: Shape): string[] {
  const needles: string[] = [];

  if (shape.layer === "macro") {
    needles.push(normalizeMpLine(shape.raw));
    return needles;
  }

  for (const line of emitPrimitive(shape)) {
    const n = normalizeMpLine(line);
    if (n) needles.push(n);
  }

  if (shape.kind === "dot") {
    if (shape.pointAssign) needles.push(normalizeMpLine(shape.pointAssign));
    if (shape.dotlabel) needles.push(normalizeMpLine(shape.dotlabel));
  }

  if ((shape.kind === "mpath" || shape.kind === "circle") && shape.pathVar) {
    needles.push(`${shape.pathVar}=`);
    needles.push(`draw ${shape.pathVar}`);
  }

  return [...new Set(needles.filter(Boolean))];
}

function lineMatchesNeedle(norm: string, needle: string): boolean {
  if (!norm || !needle) return false;
  if (norm === needle) return true;
  if (norm.startsWith(needle) || needle.startsWith(norm)) return true;
  if (norm.includes(needle) || needle.includes(norm)) return true;
  return false;
}

function lineReferencesPathVar(norm: string, pathVar: string): boolean {
  const lower = norm.toLowerCase();
  const key = pathVar.toLowerCase();
  let from = 0;
  while (from < lower.length) {
    const idx = lower.indexOf(key, from);
    if (idx < 0) return false;
    const before = idx > 0 ? norm[idx - 1] : "";
    const after = idx + key.length < norm.length ? norm[idx + key.length] : "";
    const okBefore = !before || /[\s(,;]/.test(before);
    const okAfter = !after || /[\s),.;\]]/.test(after);
    if (okBefore && okAfter) return true;
    from = idx + 1;
  }
  return false;
}

function linesReferencingPathVar(codeLines: string[], pathVar: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < codeLines.length; i++) {
    const norm = normalizeMpLine(codeLines[i]);
    if (!norm || norm.startsWith("%")) continue;
    if (!lineReferencesPathVar(norm, pathVar)) continue;
    if (
      norm.includes("label") ||
      norm.includes("dotlabel") ||
      norm.includes("point") ||
      norm.includes("hatchfill") ||
      norm.includes("draw") ||
      norm.includes("=")
    ) {
      out.push(i);
    }
  }
  return out;
}

/** 0-based line indices in `code` related to the given shape. */
export function findRelatedLineNumbers(code: string, shape: Shape): number[] {
  const codeLines = code.split("\n");
  const needles = needlesForShape(shape);
  const found = new Set<number>();

  for (let i = 0; i < codeLines.length; i++) {
    const norm = normalizeMpLine(codeLines[i]);
    if (!norm || norm.startsWith("%")) continue;
    for (const needle of needles) {
      if (lineMatchesNeedle(norm, needle)) {
        found.add(i);
        break;
      }
    }
  }

  if (shape.layer === "primitive" && (shape.kind === "mpath" || shape.kind === "circle") && shape.pathVar) {
    for (const i of linesReferencingPathVar(codeLines, shape.pathVar)) {
      found.add(i);
    }
    const zVars: string[] = [];
    const pathSuffix = `of ${shape.pathVar}`;
    for (const raw of codeLines) {
      const norm = normalizeMpLine(raw);
      const m = norm.match(/^([a-zA-Z_]\w*\[\d+\])\s*=\s*point\s+/i);
      if (m && norm.toLowerCase().includes(pathSuffix.toLowerCase())) {
        zVars.push(m[1]);
      }
    }
    for (const zVar of zVars) {
      for (let i = 0; i < codeLines.length; i++) {
        const norm = normalizeMpLine(codeLines[i]);
        if (lineReferencesPathVar(norm, zVar)) found.add(i);
      }
    }
  }

  if (shape.layer === "primitive" && shape.kind === "dot" && shape.pointAssign) {
    const varM = shape.pointAssign.match(/^([a-zA-Z_]\w*\[\d+\])/);
    if (varM) {
      const key = varM[1];
      for (let i = 0; i < codeLines.length; i++) {
        const norm = normalizeMpLine(codeLines[i]);
        if (lineReferencesPathVar(norm, key)) found.add(i);
      }
    }
  }

  return [...found].sort((a, b) => a - b);
}
