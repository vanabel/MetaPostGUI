import type { LPoint } from "./types";

export const DIR_HANDLE_LEN = 0.9;

/** MetaPost `{dir θ}`: angle in degrees, counterclockwise from +x. */
export function dirAngleToPoint(
  origin: LPoint,
  degrees: number,
  len = DIR_HANDLE_LEN,
): LPoint {
  const rad = (degrees * Math.PI) / 180;
  return {
    x: origin.x + Math.cos(rad) * len,
    y: origin.y + Math.sin(rad) * len,
  };
}

export function pointToDirAngle(origin: LPoint, p: LPoint): number {
  return (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI;
}

/** Linear interpolation: t=0 → a, t=1 → b (MetaPost `t[a,b]`). */
export function interpPoints(t: number, a: LPoint, b: LPoint): LPoint {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Rotate point about origin (MetaPost `z rotated θ`). */
export function rotatePoint(p: LPoint, degrees: number, origin: LPoint = { x: 0, y: 0 }): LPoint {
  const rad = (degrees * Math.PI) / 180;
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

/** Intersection of infinite lines through (a,b) and (c,d); null if parallel. */
export function lineIntersection(
  a: LPoint,
  b: LPoint,
  c: LPoint,
  d: LPoint,
): LPoint | null {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = d.x - c.x;
  const d2y = d.y - c.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-12) return null;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const t = (acx * d2y - acy * d2x) / cross;
  return { x: a.x + t * d1x, y: a.y + t * d1y };
}

/** Circumcircle of three non-collinear points (logical units). */
export function circumcircle(
  a: LPoint,
  b: LPoint,
  c: LPoint,
): { center: LPoint; r: number } | null {
  const d =
    2 *
    (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const center = { x: ux, y: uy };
  const r = Math.hypot(a.x - ux, a.y - uy);
  return r > 1e-9 ? { center, r } : null;
}
