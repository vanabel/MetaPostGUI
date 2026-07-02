import type { LPoint, MPathNode } from "./types";

export type CubicSegment = {
  p0: LPoint;
  cp1: LPoint;
  cp2: LPoint;
  p1: LPoint;
};

function phantomPrev(p0: LPoint, p1: LPoint): LPoint {
  return { x: 2 * p0.x - p1.x, y: 2 * p0.y - p1.y };
}

function phantomNext(pLast: LPoint, pPrev: LPoint): LPoint {
  return { x: 2 * pLast.x - pPrev.x, y: 2 * pLast.y - pPrev.y };
}

function catmullRomControls(
  p0: LPoint,
  p1: LPoint,
  p2: LPoint,
  p3: LPoint,
): { cp1: LPoint; cp2: LPoint } {
  return {
    cp1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    cp2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  };
}

function controlFromDir(anchor: LPoint, dirDeg: number, chord: number, sign: 1 | -1): LPoint {
  const len = Math.max(chord / 3, 0.05);
  const rad = (dirDeg * Math.PI) / 180;
  return {
    x: anchor.x + sign * Math.cos(rad) * len,
    y: anchor.y + sign * Math.sin(rad) * len,
  };
}

/** Cubic Bezier segments approximating MetaPost `..` (Catmull–Rom + `{dir θ}`). */
export function mpathCubicSegments(nodes: MPathNode[], closed = false): CubicSegment[] {
  if (nodes.length < 2) return [];

  const pts = nodes.map((n) => n.p);
  const n = pts.length;
  const segCount = closed ? n : n - 1;
  const segments: CubicSegment[] = [];

  for (let i = 0; i < segCount; i++) {
    const i0 = i;
    const i1 = (i + 1) % n;
    const iM = closed ? (i - 1 + n) % n : i === 0 ? -1 : i - 1;
    const iP = closed ? (i + 2) % n : i + 1 === n - 1 ? -1 : i + 2;

    const p1 = pts[i0];
    const p2 = pts[i1];
    const p0 = iM < 0 ? phantomPrev(p1, p2) : pts[iM];
    const p3 = iP < 0 ? phantomNext(p2, p1) : pts[iP];

    let { cp1, cp2 } = catmullRomControls(p0, p1, p2, p3);
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    const outNode = nodes[i0];
    const inNode = nodes[i1];
    if (outNode.dir !== undefined) {
      cp1 = controlFromDir(p1, outNode.dir, chord, 1);
    }
    if (inNode.dir !== undefined) {
      cp2 = controlFromDir(p2, inNode.dir, chord, -1);
    }

    segments.push({ p0: p1, cp1, cp2, p1: p2 });
  }

  return segments;
}

export function cubicPoint(seg: CubicSegment, t: number): LPoint {
  const u = 1 - t;
  const { p0, cp1, cp2, p1 } = seg;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p1.y,
  };
}

export function cubicDirection(seg: CubicSegment, t: number): LPoint {
  const u = 1 - t;
  const { p0, cp1, cp2, p1 } = seg;
  return {
    x:
      3 * u * u * (cp1.x - p0.x) +
      6 * u * t * (cp2.x - cp1.x) +
      3 * t * t * (p1.x - cp2.x),
    y:
      3 * u * u * (cp1.y - p0.y) +
      6 * u * t * (cp2.y - cp1.y) +
      3 * t * t * (p1.y - cp2.y),
  };
}

export function mpathToSvgD(nodes: MPathNode[], closed = false): string {
  const segments = mpathCubicSegments(nodes, closed);
  if (segments.length === 0) return "";

  const parts = [`M ${segments[0].p0.x} ${segments[0].p0.y}`];
  for (const seg of segments) {
    parts.push(
      `C ${seg.cp1.x} ${seg.cp1.y} ${seg.cp2.x} ${seg.cp2.y} ${seg.p1.x} ${seg.p1.y}`,
    );
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

const HIT_SAMPLES = 16;

/** Min distance from point to smooth mpath (for hit testing). */
export function distanceToMpath(p: LPoint, nodes: MPathNode[], closed = false): number {
  const segments = mpathCubicSegments(nodes, closed);
  let best = Infinity;

  for (const seg of segments) {
    let prev = seg.p0;
    for (let s = 1; s <= HIT_SAMPLES; s++) {
      const t = s / HIT_SAMPLES;
      const cur = cubicPoint(seg, t);
      best = Math.min(best, distToSegment(p, prev, cur));
      prev = cur;
    }
  }
  return best;
}

function distToSegment(p: LPoint, a: LPoint, b: LPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
