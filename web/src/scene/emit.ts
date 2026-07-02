import { dirAngleToPoint } from "./geom";
import { journalBounds, mergeBounds, type BBox } from "./eval";
import { appendModifiers, drawOp, repairMpDrawLine } from "./modifiers";
import { emitScaledPath, wrapMpPath } from "./path-format";
import { fmtNum, fmtPoint, fmtPointU } from "./units";
import type { LPoint, MPathNode, PrimitiveShape, Scene, Shape, ShapeStyle } from "./types";

const DEFAULT_DOT_PEN = "pencircle scaled 1pt";

function radiusToCircleScale(r: number): number {
  return r * 2;
}

function fmtMpathNode(n: MPathNode): string {
  let s = fmtPoint(n.p);
  if (n.dir !== undefined) s += `{dir ${fmtNum(n.dir)}}`;
  return s;
}

function rawAssignmentUsesUnit(raw: string | undefined): boolean {
  return (
    !!raw &&
    /(?:^|[^A-Za-z_])(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)?\s*\*?\s*)u\b|(?:cm|mm|in|pt|bp|pc|dd|cc|sp)\b/i.test(raw)
  );
}

function shapeUsesUnitPointRefs(shape: PrimitiveShape): boolean {
  return (
    Object.values(shape.pointRefAssigns ?? {}).some(rawAssignmentUsesUnit) ||
    (shape.kind === "circle" && rawAssignmentUsesUnit(shape.pathAssign))
  );
}

function shouldEmitScaled(shape: PrimitiveShape): boolean {
  if (shape.pointRefs && shapeUsesUnitPointRefs(shape)) return false;
  return shape.sourceScaled ?? true;
}

function pointToken(shape: PrimitiveShape, handle: string, p: LPoint): string {
  return shape.pointRefs?.[handle] ?? fmtPoint(p);
}

function emitPathForShape(
  shape: PrimitiveShape,
  op: string,
  pathInner: string,
  style?: ShapeStyle,
): string[] {
  if (shouldEmitScaled(shape)) return emitScaledPath(op, pathInner, style);
  return appendModifiers(`${op} ${wrapMpPath(pathInner)}`, style);
}

type PointRefUpdate = {
  p: LPoint;
  raw?: string;
  preferU: boolean;
};

function primitivePointByHandle(shape: PrimitiveShape, handle: string): LPoint | null {
  switch (shape.kind) {
    case "dot":
    case "point":
      return handle === "p" ? shape.p : null;
    case "segment":
    case "arrow":
      if (handle === "a") return shape.a;
      if (handle === "b") return shape.b;
      return null;
    case "bezier":
      if (handle === "a") return shape.a;
      if (handle === "b") return shape.b;
      if (handle === "c") return shape.c;
      if (handle === "d") return shape.d;
      return null;
    case "circle":
    case "ellipse":
      return handle === "center" ? shape.center : null;
    case "circle3":
      if (handle === "a") return shape.a;
      if (handle === "b") return shape.b;
      if (handle === "c") return shape.c;
      return null;
    case "polyline": {
      const m = handle.match(/^p(\d+)$/);
      if (!m) return null;
      return shape.pts[Number(m[1])] ?? null;
    }
    case "mpath": {
      const m = handle.match(/^p(\d+)$/);
      if (!m) return null;
      return shape.nodes[Number(m[1])]?.p ?? null;
    }
    case "rect":
      if (handle === "a") return shape.a;
      if (handle === "b") return shape.b;
      return null;
  }
}

function collectPointRefUpdates(scene: Scene): Map<string, PointRefUpdate> {
  const updates = new Map<string, PointRefUpdate>();
  for (const shape of scene.shapes) {
    if (shape.layer !== "primitive" || !shape.pointRefs) continue;
    const shapePreferU = shapeUsesUnitPointRefs(shape);
    for (const [handle, ref] of Object.entries(shape.pointRefs)) {
      const p = primitivePointByHandle(shape, handle);
      if (!p) continue;
      const raw = shape.pointRefAssigns?.[ref];
      if (!raw) continue;
      const prev = updates.get(ref);
      updates.set(ref, {
        p,
        raw: raw ?? prev?.raw,
        preferU: shapePreferU || rawAssignmentUsesUnit(raw) || prev?.preferU || false,
      });
    }
  }
  return updates;
}

function pointAssignmentTarget(raw: string): string | null {
  const m = raw.trim().match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*(?::=|=)\s*/);
  return m ? m[1] : null;
}

function formatPointAssignment(ref: string, update: PointRefUpdate): string {
  const op = update.raw?.trim().match(/^[a-zA-Z_]\w*(?:\[\d+\])?\s*(:=|=)/)?.[1] ?? ":=";
  const point = update.preferU ? fmtPointU(update.p) : fmtPoint(update.p);
  return `${ref}${op}${point};`;
}

export function emitPrimitive(shape: Shape): string[] {
  if (shape.layer !== "primitive") return [];
  if (shape.previewOnly) return [];
  const style = shape.style;
  const op = drawOp(shape.kind, style);

  switch (shape.kind) {
    case "dot": {
      if (shape.dotlabel) {
        const lines: string[] = [];
        if (shape.pointAssign && !shape.pointRefs?.p) lines.push(`${shape.pointAssign};`);
        lines.push(`${shape.dotlabel};`);
        return lines;
      }
      const pen = style?.withpen ?? DEFAULT_DOT_PEN;
      const base = `drawdot${fmtPointU(shape.p)}`;
      return appendModifiers(base, { ...style, withpen: pen });
    }
    case "point": {
      const target = pointToken(shape, "p", shape.p);
      const base = shouldEmitScaled(shape)
        ? `filldraw fullcircle scaled 1.5pt shifted ${target} scaled u`
        : `filldraw fullcircle scaled 1.5pt shifted ${target}`;
      return appendModifiers(base, style);
    }
    case "segment": {
      return emitPathForShape(
        shape,
        op,
        `${pointToken(shape, "a", shape.a)}--${pointToken(shape, "b", shape.b)}`,
        style,
      );
    }
    case "arrow": {
      return emitPathForShape(
        shape,
        "drawarrow",
        `${pointToken(shape, "a", shape.a)}--${pointToken(shape, "b", shape.b)}`,
        style,
      );
    }
    case "polyline": {
      if (shape.pts.length < 2) return [];
      const path =
        shape.pts.map((p, i) => pointToken(shape, `p${i}`, p)).join("--") +
        (shape.closed ? "--cycle" : "");
      return emitPathForShape(shape, op, path, style);
    }
    case "mpath": {
      if (shape.nodes.length < 2) return [];
      const inner = shape.nodes.map(fmtMpathNode).join("..") + (shape.closed ? "..cycle" : "");
      if (shape.pathVar) {
        const assign = `${shape.pathVar}=${wrapMpPath(inner)} scaled u;`;
        return [assign, ...appendModifiers(`draw ${shape.pathVar}`, style)];
      }
      return emitScaledPath(op, inner, style);
    }
    case "bezier": {
      const inner = `${pointToken(shape, "a", shape.a)}..controls ${pointToken(shape, "b", shape.b)} and ${pointToken(shape, "c", shape.c)}..${pointToken(shape, "d", shape.d)}`;
      return emitPathForShape(shape, op, inner, style);
    }
    case "circle": {
      if (shape.pathVar && shape.pathAssign) {
        const assign = `${shape.pathVar}=${shape.pathAssign};`;
        return [assign, ...appendModifiers(`draw ${shape.pathVar}`, style)];
      }
      const center =
        shape.pointRefs?.center && shapeUsesUnitPointRefs(shape)
          ? shape.pointRefs.center
          : fmtPointU(shape.center);
      const base = `${op} fullcircle scaled ${fmtNum(radiusToCircleScale(shape.r))}u shifted ${center}`;
      return appendModifiers(base, style);
    }
    case "circle3": {
      const inner = `${pointToken(shape, "a", shape.a)}..${pointToken(shape, "b", shape.b)}..${pointToken(shape, "c", shape.c)}..cycle`;
      return emitPathForShape(shape, op, inner, style);
    }
    case "ellipse": {
      const center =
        shape.pointRefs?.center && shapeUsesUnitPointRefs(shape)
          ? shape.pointRefs.center
          : fmtPointU(shape.center);
      const base = `${op} fullcircle xscaled ${fmtNum(radiusToCircleScale(shape.rx))}u yscaled ${fmtNum(radiusToCircleScale(shape.ry))}u shifted ${center}`;
      return appendModifiers(base, style);
    }
    case "rect": {
      const x1 = shape.a.x;
      const y1 = shape.a.y;
      const x2 = shape.b.x;
      const y2 = shape.b.y;
      const base = `${op} (${fmtNum(x1)},${fmtNum(y1)})--(${fmtNum(x2)},${fmtNum(y1)})--(${fmtNum(x2)},${fmtNum(y2)})--(${fmtNum(x1)},${fmtNum(y2)})--cycle scaled u`;
      return appendModifiers(base, style);
    }
    default:
      return [];
  }
}

export function emitScene(scene: Scene): string {
  const lines: string[] = [];
  const refUpdates = collectPointRefUpdates(scene);
  const emittedRefs = new Set<string>();
  for (const shape of scene.shapes) {
    if (shape.layer === "macro") {
      const raw = shape.raw.trim().replace(/;$/, "");
      const target = pointAssignmentTarget(raw);
      if (target && refUpdates.has(target)) {
        lines.push(formatPointAssignment(target, refUpdates.get(target)!));
        emittedRefs.add(target);
        continue;
      }
      lines.push(/^(?:draw|filldraw|drawarrow|drawdot)\b/i.test(raw) ? repairMpDrawLine(raw) : `${raw};`);
      continue;
    }
    for (const ref of Object.values(shape.pointRefs ?? {})) {
      const update = refUpdates.get(ref);
      if (update && !update.raw && !emittedRefs.has(ref)) {
        lines.push(formatPointAssignment(ref, update));
        emittedRefs.add(ref);
      }
    }
    lines.push(...emitPrimitive(shape));
  }
  return lines.join("\n");
}

/** Approximate bounding range in logical units for view fitting. */
export function sceneBounds(scene: Scene): BBox {
  const fromShapes = boundsFromShapes(scene.shapes);
  if (scene.journal && scene.journal.length > 0) {
    return mergeBounds(fromShapes, journalBounds(scene.journal));
  }
  return fromShapes;
}

function boundsFromShapes(shapes: Scene["shapes"]): BBox {
  const pts: LPoint[] = [];
  const add = (p: LPoint) => pts.push(p);

  for (const s of shapes) {
    if (s.layer === "macro") continue;
    switch (s.kind) {
      case "dot":
      case "point":
        add(s.p);
        break;
      case "segment":
      case "arrow":
        add(s.a);
        add(s.b);
        break;
      case "polyline":
        s.pts.forEach(add);
        break;
      case "mpath":
        for (const n of s.nodes) {
          add(n.p);
          if (n.dir !== undefined) add(dirAngleToPoint(n.p, n.dir));
        }
        break;
      case "bezier":
        add(s.a);
        add(s.b);
        add(s.c);
        add(s.d);
        break;
      case "circle":
        add({ x: s.center.x - s.r, y: s.center.y - s.r });
        add({ x: s.center.x + s.r, y: s.center.y + s.r });
        break;
      case "circle3":
        add(s.a);
        add(s.b);
        add(s.c);
        break;
      case "ellipse":
        add({ x: s.center.x - s.rx, y: s.center.y - s.ry });
        add({ x: s.center.x + s.rx, y: s.center.y + s.ry });
        break;
      case "rect":
        add(s.a);
        add(s.b);
        break;
    }
  }

  if (pts.length === 0) {
    return { minX: -6, maxX: 6, minY: -6, maxY: 6 };
  }
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}
