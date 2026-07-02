import type { LPoint } from "./types";

const U_RE = /\bu\s*:?=\s*(\d+(?:\.\d+)?)\s*pt/i;

/** Read scale factor from mpostdef (`u=10pt` or `u := 10pt`). */
export function parseUnitScale(mpostdef: string): number {
  const m = mpostdef.match(U_RE);
  return m ? parseFloat(m[1]) : 10;
}

export function snapValue(v: number, step: number, enabled: boolean): number {
  if (!enabled || step <= 0) return v;
  return Math.round(v / step) * step;
}

export function snapPoint(
  p: LPoint,
  step: number,
  enabled: boolean,
): LPoint {
  return {
    x: snapValue(p.x, step, enabled),
    y: snapValue(p.y, step, enabled),
  };
}

export function fmtNum(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/\.?0+$/, "");
}

export function fmtPoint(p: LPoint): string {
  return `(${fmtNum(p.x)},${fmtNum(p.y)})`;
}

/** MetaPost coordinate with explicit `u` suffix, e.g. (3u/2,0). */
export function fmtPointU(p: LPoint): string {
  return `(${fmtNum(p.x)}u,${fmtNum(p.y)}u)`;
}
