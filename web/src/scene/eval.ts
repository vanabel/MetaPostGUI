import { dirAngleToPoint } from "./geom";
import type { GeomEntry, LPoint, Shape } from "./types";

export type { GeomEntry } from "./types";
export type BBox = { minX: number; maxX: number; minY: number; maxY: number };

const DEFAULT_BOUNDS: BBox = { minX: -6, maxX: 6, minY: -6, maxY: 6 };

function collectPoints(entry: GeomEntry): LPoint[] {
  switch (entry.kind) {
    case "segment":
      return [entry.a, entry.b];
    case "polyline":
      return entry.pts;
    case "dot":
      return [entry.p];
  }
}

export function journalBounds(journal: GeomEntry[]): BBox {
  const pts: LPoint[] = [];
  for (const e of journal) pts.push(...collectPoints(e));
  if (pts.length === 0) return { ...DEFAULT_BOUNDS };
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export function mergeBounds(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function appendShapeToJournal(journal: GeomEntry[], shape: Shape): void {
  if (shape.layer !== "primitive") return;
  const style = shape.style;
  switch (shape.kind) {
    case "dot":
    case "point":
      journal.push({ kind: "dot", p: shape.p, style });
      break;
    case "segment":
    case "arrow":
      journal.push({ kind: "segment", a: shape.a, b: shape.b, style });
      break;
    case "polyline":
      journal.push({
        kind: "polyline",
        pts: shape.pts,
        closed: shape.closed,
        style,
      });
      break;
    case "mpath":
      for (let i = 0; i < shape.nodes.length - 1; i++) {
        journal.push({
          kind: "segment",
          a: shape.nodes[i]!.p,
          b: shape.nodes[i + 1]!.p,
          style,
        });
      }
      if (shape.closed && shape.nodes.length >= 2) {
        journal.push({
          kind: "segment",
          a: shape.nodes[shape.nodes.length - 1]!.p,
          b: shape.nodes[0]!.p,
          style,
        });
      }
      for (const n of shape.nodes) {
        if (n.dir !== undefined) {
          journal.push({
            kind: "segment",
            a: n.p,
            b: dirAngleToPoint(n.p, n.dir),
            style,
          });
        }
      }
      break;
    case "bezier":
      journal.push({ kind: "segment", a: shape.a, b: shape.d, style });
      break;
    case "circle":
      journal.push(
        { kind: "dot", p: { x: shape.center.x - shape.r, y: shape.center.y }, style },
        { kind: "dot", p: { x: shape.center.x + shape.r, y: shape.center.y }, style },
        { kind: "dot", p: { x: shape.center.x, y: shape.center.y - shape.r }, style },
        { kind: "dot", p: { x: shape.center.x, y: shape.center.y + shape.r }, style },
      );
      break;
    case "circle3":
      journal.push(
        { kind: "dot", p: shape.a, style },
        { kind: "dot", p: shape.b, style },
        { kind: "dot", p: shape.c, style },
      );
      break;
    case "ellipse":
      journal.push(
        { kind: "dot", p: { x: shape.center.x - shape.rx, y: shape.center.y }, style },
        { kind: "dot", p: { x: shape.center.x + shape.rx, y: shape.center.y }, style },
        { kind: "dot", p: { x: shape.center.x, y: shape.center.y - shape.ry }, style },
        { kind: "dot", p: { x: shape.center.x, y: shape.center.y + shape.ry }, style },
      );
      break;
    case "rect":
      journal.push({
        kind: "polyline",
        pts: [shape.a, { x: shape.b.x, y: shape.a.y }, shape.b, { x: shape.a.x, y: shape.b.y }],
        closed: true,
        style,
      });
      break;
  }
}

export function buildJournal(shapes: Shape[]): GeomEntry[] {
  const journal: GeomEntry[] = [];
  for (const s of shapes) appendShapeToJournal(journal, s);
  return journal;
}
