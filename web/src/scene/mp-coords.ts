import { interpPoints } from "./geom";
import { evalNumeric, lookupNumeric } from "./mp-numeric";
import { peelOuterParens, splitOnDoubleDash, stripScaledU } from "./path-format";
import type { LPoint } from "./types";

/** Parse a scalar: 3, 3u, 1cm, 4bp, or named numeric (unit suffix stripped for canvas). */
export function parseScalar(expr: string, numericVars?: Map<string, number>): number | null {
  const unit = expr.trim().replace(/\s+/g, "").match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\*?u$/i);
  if (unit) {
    const raw = unit[1];
    if (!raw || raw === "+") return 1;
    if (raw === "-") return -1;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (numericVars) {
    const named = lookupNumeric(expr, numericVars);
    if (named !== null) return named;
  }
  let t = expr.trim().replace(/\s+/g, "");
  const signedUnit = t.match(/^([+-]?)u$/i);
  if (signedUnit) return signedUnit[1] === "-" ? -1 : 1;
  t = t.replace(/(cm|mm|in|pt|bp|pc|dd|cc|sp)$/i, "");
  t = t.replace(/\*?u$/i, "");
  const parenU = t.match(/^\(([\d./]+)\*u\)$/i);
  if (parenU) {
    const n = parseFloat(parenU[1]);
    return Number.isFinite(n) ? n : null;
  }
  const div = t.match(/^(-?[\d.]+)\/(-?[\d.]+)$/);
  if (div) {
    const n = parseFloat(div[1]) / parseFloat(div[2]);
    return Number.isFinite(n) ? n : null;
  }
  if (
    !/^-?[\d.]+(?:\/[\d.]+)?(?:\*?u)?(?:cm|mm|in|pt|bp|pc|dd|cc|sp)?$/i.test(t)
  ) {
    return null;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse (3,2), (3u,2u), (u,0), or bare -5,3 */
export function parseCoordToken(
  token: string,
  numericVars?: Map<string, number>,
): LPoint | null {
  let t = token.trim();
  if (!t.startsWith("(")) {
    const bare = t.match(/^([^,]+)\s*,\s*([^,]+)$/);
    if (bare) {
      const x = parseScalar(bare[1], numericVars);
      const y = parseScalar(bare[2], numericVars);
      if (x !== null && y !== null) return { x, y };
    }
    t = `(${t})`;
  }

  const m = t.match(/^\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
  if (!m) return null;
  const x = parseScalar(m[1], numericVars);
  const y = parseScalar(m[2], numericVars);
  if (x === null || y === null) return null;
  return { x, y };
}

export function resolvePointArg(
  arg: string,
  pointVars: Map<string, LPoint>,
  numericVars?: Map<string, number>,
): LPoint | null {
  const t = arg.trim();
  const varM = t.match(/^([a-zA-Z_]\w*)\[(\d+)\]$/);
  if (varM) {
    return pointVars.get(`${varM[1]}[${varM[2]}]`) ?? null;
  }
  if (/^[a-zA-Z_]\w*$/.test(t)) {
    return pointVars.get(t) ?? null;
  }
  return parseCoordToken(t, numericVars);
}

/** Path endpoint: named/indexed point, coordinate, or `t[a,b]` interpolation. */
export function resolvePathEndpoint(
  tok: string,
  pointVars: Map<string, LPoint>,
  numericVars?: Map<string, number>,
): LPoint | null {
  const t = tok.trim();
  if (/^[a-zA-Z_]\w*\[\d+\]$/.test(t)) {
    return resolvePointArg(t, pointVars, numericVars);
  }
  const bracket = t.indexOf("[");
  if (bracket > 0) {
    const pairM = t.slice(bracket).match(/^\[([^,\]]+)\s*,\s*([^\]]+)\]$/);
    if (pairM) {
      const fracPart = t.slice(0, bracket).trim();
      const frac =
        evalNumeric(fracPart, numericVars ?? new Map()) ??
        parseScalar(fracPart, numericVars);
      const a = resolvePointArg(pairM[1].trim(), pointVars, numericVars);
      const b = resolvePointArg(pairM[2].trim(), pointVars, numericVars);
      if (frac !== null && a && b) return interpPoints(frac, a, b);
    }
  }
  const tight = t.match(/^([\d./()a-zA-Z_+\-*\s]+)\[([^,\]]+)\s*,\s*([^\]]+)\]$/);
  if (tight) {
    const frac =
      evalNumeric(tight[1], numericVars ?? new Map()) ??
      parseScalar(tight[1], numericVars);
    const a = resolvePointArg(tight[2].trim(), pointVars, numericVars);
    const b = resolvePointArg(tight[3].trim(), pointVars, numericVars);
    if (frac !== null && a && b) return interpPoints(frac, a, b);
  }
  return resolvePointArg(t, pointVars, numericVars);
}

export function parsePathPoints(path: string, numericVars?: Map<string, number>): LPoint[] {
  const body = peelOuterParens(stripScaledU(path));
  return splitOnDoubleDash(body)
    .map((part) => parseCoordToken(part, numericVars))
    .filter((p): p is LPoint => p !== null);
}

export function parseTwoPointPath(
  path: string,
  numericVars?: Map<string, number>,
): { a: LPoint; b: LPoint } | null {
  const pts = parsePathPoints(path, numericVars);
  if (pts.length < 2) return null;
  return { a: pts[0], b: pts[pts.length - 1] };
}
