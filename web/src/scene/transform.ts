import { dirAngleToPoint, pointToDirAngle } from "./geom";
import type { LPoint, PrimitiveShape, Shape } from "./types";

export type HandleId = string;

export type Handle = { id: HandleId; p: LPoint };

export function getHandles(shape: Shape): Handle[] {
  if (shape.layer !== "primitive") return [];
  switch (shape.kind) {
    case "dot":
    case "point":
      return [{ id: "p", p: shape.p }];
    case "segment":
    case "arrow":
      return [
        { id: "a", p: shape.a },
        { id: "b", p: shape.b },
      ];
    case "polyline":
      return shape.pts.map((p, i) => ({ id: `p${i}`, p }));
    case "mpath": {
      const handles: Handle[] = shape.nodes.map((n, i) => ({ id: `p${i}`, p: n.p }));
      shape.nodes.forEach((n, i) => {
        if (n.dir !== undefined) {
          handles.push({
            id: `d${i}`,
            p: dirAngleToPoint(n.p, n.dir),
          });
        }
      });
      return handles;
    }
    case "bezier":
      return [
        { id: "a", p: shape.a },
        { id: "b", p: shape.b },
        { id: "c", p: shape.c },
        { id: "d", p: shape.d },
      ];
    case "circle":
      return [
        { id: "center", p: shape.center },
        { id: "rim", p: { x: shape.center.x + shape.r, y: shape.center.y } },
      ];
    case "circle3":
      return [
        { id: "a", p: shape.a },
        { id: "b", p: shape.b },
        { id: "c", p: shape.c },
      ];
    case "ellipse":
      return [
        { id: "center", p: shape.center },
        { id: "rx", p: { x: shape.center.x + shape.rx, y: shape.center.y } },
        { id: "ry", p: { x: shape.center.x, y: shape.center.y + shape.ry } },
      ];
    case "rect":
      return [
        { id: "a", p: shape.a },
        { id: "b", p: shape.b },
      ];
    default:
      return [];
  }
}

export function moveShape(shape: PrimitiveShape, dx: number, dy: number): PrimitiveShape {
  const shift = (p: LPoint): LPoint => ({ x: p.x + dx, y: p.y + dy });
  switch (shape.kind) {
    case "dot":
    case "point":
      return { ...shape, p: shift(shape.p) };
    case "segment":
    case "arrow":
      return { ...shape, a: shift(shape.a), b: shift(shape.b) };
    case "polyline":
      return { ...shape, pts: shape.pts.map(shift) };
    case "mpath":
      return {
        ...shape,
        nodes: shape.nodes.map((n) => ({
          p: shift(n.p),
          dir: n.dir,
        })),
      };
    case "bezier":
      return {
        ...shape,
        a: shift(shape.a),
        b: shift(shape.b),
        c: shift(shape.c),
        d: shift(shape.d),
      };
    case "circle3":
      return { ...shape, a: shift(shape.a), b: shift(shape.b), c: shift(shape.c) };
    case "circle":
      return { ...shape, center: shift(shape.center) };
    case "ellipse":
      return { ...shape, center: shift(shape.center) };
    case "rect":
      return { ...shape, a: shift(shape.a), b: shift(shape.b) };
    default:
      return shape;
  }
}

export function setHandle(
  shape: PrimitiveShape,
  handleId: HandleId,
  p: LPoint,
): PrimitiveShape {
  switch (shape.kind) {
    case "dot":
    case "point":
      if (handleId === "p") return { ...shape, p };
      break;
    case "segment":
    case "arrow":
      if (handleId === "a") return { ...shape, a: p };
      if (handleId === "b") return { ...shape, b: p };
      break;
    case "polyline": {
      const i = parseInt(handleId.slice(1), 10);
      if (!Number.isNaN(i) && i >= 0 && i < shape.pts.length) {
        const pts = [...shape.pts];
        pts[i] = p;
        return { ...shape, pts };
      }
      break;
    }
    case "mpath": {
      if (handleId.startsWith("p")) {
        const i = parseInt(handleId.slice(1), 10);
        if (!Number.isNaN(i) && i >= 0 && i < shape.nodes.length) {
          const nodes = shape.nodes.map((n) => ({ ...n, p: { ...n.p } }));
          nodes[i] = { ...nodes[i], p };
          return { ...shape, nodes };
        }
      }
      if (handleId.startsWith("d")) {
        const i = parseInt(handleId.slice(1), 10);
        if (!Number.isNaN(i) && i >= 0 && i < shape.nodes.length) {
          const nodes = shape.nodes.map((n) => ({ ...n, p: { ...n.p } }));
          const base = nodes[i].p;
          nodes[i] = {
            ...nodes[i],
            dir: pointToDirAngle(base, p),
          };
          return { ...shape, nodes };
        }
      }
      break;
    }
    case "bezier":
      if (handleId === "a") return { ...shape, a: p };
      if (handleId === "b") return { ...shape, b: p };
      if (handleId === "c") return { ...shape, c: p };
      if (handleId === "d") return { ...shape, d: p };
      break;
    case "circle3":
      if (handleId === "a") return { ...shape, a: p };
      if (handleId === "b") return { ...shape, b: p };
      if (handleId === "c") return { ...shape, c: p };
      break;
    case "circle":
      if (handleId === "center") return { ...shape, center: p };
      if (handleId === "rim") {
        const r = Math.hypot(p.x - shape.center.x, p.y - shape.center.y);
        return { ...shape, r: Math.max(r, 0.05) };
      }
      break;
    case "ellipse":
      if (handleId === "center") return { ...shape, center: p };
      if (handleId === "rx")
        return { ...shape, rx: Math.max(Math.abs(p.x - shape.center.x), 0.05) };
      if (handleId === "ry")
        return { ...shape, ry: Math.max(Math.abs(p.y - shape.center.y), 0.05) };
      break;
    case "rect":
      if (handleId === "a") return { ...shape, a: p };
      if (handleId === "b") return { ...shape, b: p };
      break;
  }
  return shape;
}
