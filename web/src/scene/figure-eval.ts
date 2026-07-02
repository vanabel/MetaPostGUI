import { appendShapeToJournal } from "./eval";
import { interpPoints, lineIntersection, rotatePoint } from "./geom";
import {
  parseCoordToken,
  parsePathPoints,
  parseScalar,
  parseTwoPointPath,
  resolvePointArg,
} from "./mp-coords";
import { evalNumeric } from "./mp-numeric";
import {
  extractDrawPathBody,
  isWholeWrappedInParens,
  peelOuterParens,
  splitOnDoubleDash,
  splitOnDoubleDot,
  stripScaledU,
} from "./path-format";
import {
  cubicDirection as mpathCubicDirection,
  cubicPoint as mpathCubicPoint,
  mpathCubicSegments,
} from "./mpath-spline";
import type { FigureProgram, Stmt } from "./stmt-ir";
import type { GeomEntry, LPoint, MPathNode, Scene, Shape, ShapeStyle } from "./types";
import { newId } from "./types";

type EvalCtx = {
  shapes: Shape[];
  journal: GeomEntry[];
  pointVars: Map<string, LPoint>;
  numericVars: Map<string, number>;
  pointAssignLines: Map<string, string>;
};

type PathValue = {
  pts: LPoint[];
  closed?: boolean;
};

type PointEval = {
  p: LPoint;
  ref?: string;
};

type PathEval = {
  pts: LPoint[];
  closed?: boolean;
  refs?: Record<string, string>;
  assigns?: Record<string, string>;
};

const VECTOR_CONSTANTS: Record<string, LPoint> = {
  origin: { x: 0, y: 0 },
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
};

function clonePoint(p: LPoint): LPoint {
  return { x: p.x, y: p.y };
}

function addPoints(a: LPoint, b: LPoint): LPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subPoints(a: LPoint, b: LPoint): LPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scalePoint(k: number, p: LPoint): LPoint {
  return { x: k * p.x, y: k * p.y };
}

function normalizePoint(p: LPoint): LPoint | null {
  const len = Math.hypot(p.x, p.y);
  if (len < 1e-12) return null;
  return { x: p.x / len, y: p.y / len };
}

const FULLCIRCLE_SEGMENTS = 8;
const CIRCLE_BEZIER_K = (4 / 3) * Math.tan(Math.PI / 16);

function trackDepth(ch: string, depth: { paren: number; bracket: number; brace: number }): void {
  if (ch === "(") depth.paren++;
  else if (ch === ")") depth.paren--;
  else if (ch === "[") depth.bracket++;
  else if (ch === "]") depth.bracket--;
  else if (ch === "{") depth.brace++;
  else if (ch === "}") depth.brace--;
}

function atDepth0(depth: { paren: number; bracket: number; brace: number }): boolean {
  return depth.paren === 0 && depth.bracket === 0 && depth.brace === 0;
}

function splitTopLevelChar(
  s: string,
  op: "+" | "-" | "*" | "/" | ",",
  fromRight = false,
): [string, string] | null {
  const depth = { paren: 0, bracket: 0, brace: 0 };
  const hits: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{" || ch === "}") {
      trackDepth(ch, depth);
      continue;
    }
    if (ch !== op || !atDepth0(depth)) continue;
    if ((op === "+" || op === "-") && (i === 0 || /[+\-*/,(]/.test(s[i - 1]!))) continue;
    hits.push(i);
  }
  if (hits.length === 0) return null;
  const i = fromRight ? hits[hits.length - 1]! : hits[0]!;
  const left = s.slice(0, i).trim();
  const right = s.slice(i + 1).trim();
  return left && right ? [left, right] : null;
}

function isWordBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[A-Za-z0-9_]/.test(ch);
}

function splitTopLevelKeyword(
  s: string,
  keyword: string,
  fromRight = false,
): [string, string] | null {
  const depth = { paren: 0, bracket: 0, brace: 0 };
  const hits: number[] = [];
  const lower = s.toLowerCase();
  const key = keyword.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{" || ch === "}") {
      trackDepth(ch, depth);
      continue;
    }
    if (!atDepth0(depth)) continue;
    if (
      lower.startsWith(key, i) &&
      isWordBoundary(s[i - 1]) &&
      isWordBoundary(s[i + key.length])
    ) {
      hits.push(i);
    }
  }
  if (hits.length === 0) return null;
  const i = fromRight ? hits[hits.length - 1]! : hits[0]!;
  const left = s.slice(0, i).trim();
  const right = s.slice(i + keyword.length).trim();
  return left && right ? [left, right] : null;
}

function circleScaleToRadius(scale: number): number {
  return scale / 2;
}

function parsePair(s: string, numericVars?: Map<string, number>): LPoint | null {
  return parseCoordToken(s, numericVars);
}

function pushMacro(ctx: EvalCtx, line: string, name?: string): void {
  ctx.shapes.push({
    id: newId(),
    layer: "macro",
    raw: line.replace(/;?\s*$/, ""),
    name: name ?? "macro",
  });
}

function attachLabel(ctx: EvalCtx, labelLine: string): boolean {
  for (let i = ctx.shapes.length - 1; i >= 0; i--) {
    const s = ctx.shapes[i];
    if (s.layer === "primitive") {
      s.style = { ...s.style, label: labelLine.replace(/;\s*$/, "") };
      return true;
    }
  }
  return false;
}

function pushPrimitive(
  ctx: EvalCtx,
  shape: Shape & { layer: "primitive" },
  style: ShapeStyle,
): void {
  if (Object.keys(style).length > 0) {
    shape.style = { ...shape.style, ...style };
  }
  ctx.shapes.push(shape);
  appendShapeToJournal(ctx.journal, shape);
}

function splitTopLevelArgs(s: string): string[] {
  const args: string[] = [];
  const depth = { paren: 0, bracket: 0, brace: 0 };
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{" || ch === "}") {
      trackDepth(ch, depth);
      continue;
    }
    if (ch === "," && atDepth0(depth)) {
      args.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(s.slice(start).trim());
  return args.filter(Boolean);
}

function findPathPrimitive(shapes: Shape[], pathVar: string) {
  return shapes.find(
    (s) =>
      s.layer === "primitive" &&
      (s.kind === "mpath" || s.kind === "circle" || s.kind === "polyline") &&
      s.pathVar === pathVar,
  );
}

function resolvePathVar(ctx: EvalCtx, pathVar: string): Shape | null {
  const prim = findPathPrimitive(ctx.shapes, pathVar);
  return prim ?? null;
}

function linearlyInterpolatePathPoints(
  pts: LPoint[],
  t: number,
  closed = false,
): LPoint | null {
  if (pts.length === 0 || !Number.isFinite(t)) return null;
  if (pts.length === 1) return clonePoint(pts[0]!);

  if (closed) {
    const base = Math.floor(t);
    const frac = t - base;
    const i = ((base % pts.length) + pts.length) % pts.length;
    const j = (i + 1) % pts.length;
    return interpPoints(frac, pts[i]!, pts[j]!);
  }

  if (t <= 0) return clonePoint(pts[0]!);
  const lastSeg = pts.length - 1;
  if (t >= lastSeg) return clonePoint(pts[pts.length - 1]!);
  const i = Math.floor(t);
  return interpPoints(t - i, pts[i]!, pts[i + 1]!);
}

function linearlyInterpolatePathDirection(
  pts: LPoint[],
  t: number,
  closed = false,
): LPoint | null {
  if (pts.length < 2 || !Number.isFinite(t)) return null;
  let i = Math.floor(t);
  if (closed) {
    i = ((i % pts.length) + pts.length) % pts.length;
    return subPoints(pts[(i + 1) % pts.length]!, pts[i]!);
  }
  i = Math.max(0, Math.min(pts.length - 2, i));
  return subPoints(pts[i + 1]!, pts[i]!);
}

function mpathSegmentAt(
  nodes: MPathNode[],
  t: number,
  closed = false,
): { seg: ReturnType<typeof mpathCubicSegments>[number]; local: number } | null {
  if (!Number.isFinite(t)) return null;
  const segments = mpathCubicSegments(nodes, closed);
  if (segments.length === 0) return null;

  if (closed) {
    const wrapped = ((t % segments.length) + segments.length) % segments.length;
    const i = Math.floor(wrapped);
    return { seg: segments[i]!, local: wrapped - i };
  }

  if (t <= 0) return { seg: segments[0]!, local: 0 };
  if (t >= segments.length) return { seg: segments[segments.length - 1]!, local: 1 };
  const i = Math.floor(t);
  return { seg: segments[i]!, local: t - i };
}

function pointOnPathShape(shape: Shape, t: number): LPoint | null {
  if (shape.layer !== "primitive") return null;
  if (shape.kind === "circle") {
    const time = normalizeCircleTime(t, shape.circleBuiltin === "halfcircle");
    const seg = circleBezierSegment(shape.center, shape.r, time.seg);
    return cubicPoint(seg.a, seg.b, seg.c, seg.d, time.local);
  }
  if (shape.kind === "mpath") {
    const hit = mpathSegmentAt(shape.nodes, t, shape.closed);
    return hit ? mpathCubicPoint(hit.seg, hit.local) : null;
  }
  if (shape.kind === "polyline") {
    return linearlyInterpolatePathPoints(shape.pts, t, shape.closed);
  }
  return null;
}

function directionOnPathShape(shape: Shape, t: number): LPoint | null {
  if (shape.layer !== "primitive") return null;
  if (shape.kind === "circle") {
    const time = normalizeCircleTime(t, shape.circleBuiltin === "halfcircle");
    const seg = circleBezierSegment(shape.center, shape.r, time.seg);
    return cubicDirection(seg.a, seg.b, seg.c, seg.d, time.local);
  }
  if (shape.kind === "mpath") {
    const hit = mpathSegmentAt(shape.nodes, t, shape.closed);
    return hit ? mpathCubicDirection(hit.seg, hit.local) : null;
  }
  if (shape.kind === "polyline") {
    return linearlyInterpolatePathDirection(shape.pts, t, shape.closed);
  }
  return null;
}

function pathShapePoints(shape: Shape): PathValue | null {
  if (shape.layer !== "primitive") return null;
  if (shape.kind === "polyline") return { pts: shape.pts.map(clonePoint), closed: shape.closed };
  if (shape.kind === "mpath") {
    return { pts: shape.nodes.map((n) => clonePoint(n.p)), closed: shape.closed };
  }
  if (shape.kind === "circle") {
    return {
      pts: [
        { x: shape.center.x + shape.r, y: shape.center.y },
        { x: shape.center.x + shape.r / Math.SQRT2, y: shape.center.y + shape.r / Math.SQRT2 },
        { x: shape.center.x, y: shape.center.y + shape.r },
        { x: shape.center.x - shape.r / Math.SQRT2, y: shape.center.y + shape.r / Math.SQRT2 },
        { x: shape.center.x - shape.r, y: shape.center.y },
        { x: shape.center.x - shape.r / Math.SQRT2, y: shape.center.y - shape.r / Math.SQRT2 },
        { x: shape.center.x, y: shape.center.y - shape.r },
        { x: shape.center.x + shape.r / Math.SQRT2, y: shape.center.y - shape.r / Math.SQRT2 },
      ],
      closed: shape.circleBuiltin !== "halfcircle",
    };
  }
  return null;
}

function pathShapeParameterLength(shape: Shape): number | null {
  if (shape.layer !== "primitive") return null;
  if (shape.kind === "circle") return shape.circleBuiltin === "halfcircle" ? 4 : 8;
  if (shape.kind === "mpath") {
    return shape.closed ? shape.nodes.length : Math.max(0, shape.nodes.length - 1);
  }
  if (shape.kind === "polyline") {
    return shape.closed ? shape.pts.length : Math.max(0, shape.pts.length - 1);
  }
  return null;
}

function pointOnPathVar(ctx: EvalCtx, pathVar: string, t: number): LPoint | null {
  const shape = resolvePathVar(ctx, pathVar);
  return shape ? pointOnPathShape(shape, t) : null;
}

function directionOnPathVar(ctx: EvalCtx, pathVar: string, t: number): LPoint | null {
  const shape = resolvePathVar(ctx, pathVar);
  return shape ? directionOnPathShape(shape, t) : null;
}

function circleKnot(center: LPoint, r: number, i: number): LPoint {
  const theta = (Math.PI / 4) * i;
  return {
    x: center.x + r * Math.cos(theta),
    y: center.y + r * Math.sin(theta),
  };
}

function circleTangent(i: number): LPoint {
  const theta = (Math.PI / 4) * i;
  return { x: -Math.sin(theta), y: Math.cos(theta) };
}

function cubicPoint(a: LPoint, b: LPoint, c: LPoint, d: LPoint, t: number): LPoint {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * b.x + 3 * mt * t ** 2 * c.x + t ** 3 * d.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * b.y + 3 * mt * t ** 2 * c.y + t ** 3 * d.y,
  };
}

function cubicDirection(a: LPoint, b: LPoint, c: LPoint, d: LPoint, t: number): LPoint {
  const mt = 1 - t;
  return {
    x:
      3 * mt ** 2 * (b.x - a.x) +
      6 * mt * t * (c.x - b.x) +
      3 * t ** 2 * (d.x - c.x),
    y:
      3 * mt ** 2 * (b.y - a.y) +
      6 * mt * t * (c.y - b.y) +
      3 * t ** 2 * (d.y - c.y),
  };
}

function circleBezierSegment(
  center: LPoint,
  r: number,
  seg: number,
): { a: LPoint; b: LPoint; c: LPoint; d: LPoint } {
  const a = circleKnot(center, r, seg);
  const d = circleKnot(center, r, seg + 1);
  const ta = circleTangent(seg);
  const td = circleTangent(seg + 1);
  return {
    a,
    b: addPoints(a, scalePoint(CIRCLE_BEZIER_K * r, ta)),
    c: subPoints(d, scalePoint(CIRCLE_BEZIER_K * r, td)),
    d,
  };
}

function normalizeCircleTime(t: number, halfcircle: boolean): { seg: number; local: number } {
  const max = halfcircle ? 4 : FULLCIRCLE_SEGMENTS;
  const clamped = halfcircle ? Math.max(0, Math.min(max, t)) : ((t % max) + max) % max;
  const base = Math.min(max - 1, Math.floor(clamped));
  return { seg: base, local: clamped - base };
}

function evalScalarExpr(ctx: EvalCtx, expr: string): number | null {
  const t = peelOuterParens(expr.trim());
  if (!t) return null;

  const partM = t.match(/^(xpart|ypart)\s*(?:\(\s*([\s\S]+?)\s*\)|\s+([\s\S]+))$/i);
  if (partM) {
    const p = evalPointExpr(ctx, (partM[2] ?? partM[3] ?? "").trim());
    if (!p) return null;
    return partM[1].toLowerCase() === "xpart" ? p.x : p.y;
  }

  const lengthM = t.match(/^length\s*(?:\(\s*([a-zA-Z_]\w*(?:\[\d+\])?)\s*\)|\s+([a-zA-Z_]\w*(?:\[\d+\])?))$/i);
  if (lengthM) {
    const pathVar = lengthM[1] ?? lengthM[2];
    const shape = resolvePathVar(ctx, pathVar);
    return shape ? pathShapeParameterLength(shape) : null;
  }

  const angleM = t.match(/^angle\s+([\s\S]+)$/i);
  if (angleM) {
    const p = evalPointExpr(ctx, angleM[1].trim());
    return p ? (Math.atan2(p.y, p.x) * 180) / Math.PI : null;
  }

  return evalNumeric(t, ctx.numericVars) ?? parseScalar(t, ctx.numericVars);
}

function evalPathIntersectionPoint(ctx: EvalCtx, expr: string): LPoint | null {
  const hit = splitTopLevelKeyword(expr, "intersectionpoint");
  if (!hit) return null;
  const a = evalPathValue(ctx, hit[0]);
  const b = evalPathValue(ctx, hit[1]);
  if (!a || !b || a.pts.length < 2 || b.pts.length < 2) return null;
  return lineIntersection(a.pts[0]!, a.pts[a.pts.length - 1]!, b.pts[0]!, b.pts[b.pts.length - 1]!);
}

function evalPointExpr(ctx: EvalCtx, expr: string): LPoint | null {
  const t = peelOuterParens(expr.trim());
  if (!t) return null;

  const intersection = evalPathIntersectionPoint(ctx, t);
  if (intersection) return intersection;

  const rotated = splitTopLevelKeyword(t, "rotated", true);
  if (rotated) {
    const p = evalPointExpr(ctx, rotated[0]);
    const deg = evalScalarExpr(ctx, rotated[1]);
    return p && deg !== null ? rotatePoint(p, deg) : null;
  }

  const plus = splitTopLevelChar(t, "+", true);
  if (plus) {
    const a = evalPointExpr(ctx, plus[0]);
    const b = evalPointExpr(ctx, plus[1]);
    if (a && b) return addPoints(a, b);
  }

  const minus = splitTopLevelChar(t, "-", true);
  if (minus) {
    const a = evalPointExpr(ctx, minus[0]);
    const b = evalPointExpr(ctx, minus[1]);
    if (a && b) return subPoints(a, b);
  }

  const mul = splitTopLevelChar(t, "*");
  if (mul) {
    const leftScalar = evalScalarExpr(ctx, mul[0]);
    const rightPoint = evalPointExpr(ctx, mul[1]);
    if (leftScalar !== null && rightPoint) return scalePoint(leftScalar, rightPoint);
    const leftPoint = evalPointExpr(ctx, mul[0]);
    const rightScalar = evalScalarExpr(ctx, mul[1]);
    if (leftPoint && rightScalar !== null) return scalePoint(rightScalar, leftPoint);
  }

  const div = splitTopLevelChar(t, "/", true);
  if (div) {
    const p = evalPointExpr(ctx, div[0]);
    const k = evalScalarExpr(ctx, div[1]);
    if (p && k !== null && Math.abs(k) > 1e-12) return scalePoint(1 / k, p);
  }

  const bracket = t.indexOf("[");
  if (bracket > 0 && t.endsWith("]")) {
    const pairM = t.slice(bracket).match(/^\[([^,\]]+)\s*,\s*([^\]]+)\]$/);
    if (pairM) {
      const frac = evalScalarExpr(ctx, t.slice(0, bracket).trim());
      const a = evalPointExpr(ctx, pairM[1].trim());
      const b = evalPointExpr(ctx, pairM[2].trim());
      if (frac !== null && a && b) return interpPoints(frac, a, b);
    }
  }

  const unitM = t.match(/^unitvector\s*\(\s*([\s\S]+)\s*\)$/i);
  if (unitM) {
    const p = evalPointExpr(ctx, unitM[1].trim());
    return p ? normalizePoint(p) : null;
  }

  const pointM = t.match(/^point\s+([\s\S]+?)\s+of\s+([a-zA-Z_]\w*(?:\[\d+\])?)$/i);
  if (pointM) {
    const time = evalScalarExpr(ctx, pointM[1].trim());
    return time !== null ? pointOnPathVar(ctx, pointM[2], time) : null;
  }

  const directionM = t.match(/^direction\s+([\s\S]+?)\s+of\s+([a-zA-Z_]\w*(?:\[\d+\])?)$/i);
  if (directionM) {
    const time = evalScalarExpr(ctx, directionM[1].trim());
    return time !== null ? directionOnPathVar(ctx, directionM[2], time) : null;
  }

  const dirM = t.match(/^dir\s*(?:\(\s*([\s\S]+?)\s*\)|\s+([\s\S]+))$/i);
  if (dirM) {
    const deg = evalScalarExpr(ctx, (dirM[1] ?? dirM[2] ?? "").trim());
    if (deg !== null) {
      const rad = (deg * Math.PI) / 180;
      return { x: Math.cos(rad), y: Math.sin(rad) };
    }
  }

  const constant = VECTOR_CONSTANTS[t.toLowerCase()];
  if (constant) return clonePoint(constant);

  const coord = parseCoordExpr(ctx, t);
  if (coord) return coord;

  const varM = t.match(/^([a-zA-Z_]\w*)\[(\d+)\]$/);
  if (varM) return ctx.pointVars.get(`${varM[1]}[${varM[2]}]`) ?? null;
  if (/^[a-zA-Z_]\w*$/.test(t)) return ctx.pointVars.get(t) ?? null;

  return resolvePointArg(t, ctx.pointVars, ctx.numericVars);
}

function closePoint(a: LPoint, b: LPoint, tol = 1e-9): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

function findUniquePointRef(ctx: EvalCtx, p: LPoint): string | undefined {
  let found: string | undefined;
  for (const [name, value] of ctx.pointVars) {
    if (!closePoint(value, p)) continue;
    if (found && found !== name) return undefined;
    found = name;
  }
  return found;
}

function isWritablePointAssign(raw: string): boolean {
  const rhs = raw.replace(/;\s*$/, "").replace(/^[a-zA-Z_]\w*(?:\[\d+\])?\s*(?::=|=)\s*/, "").trim();
  return !/^point\b/i.test(rhs) && !/\bof\b/i.test(rhs);
}

function pointRefAssigns(ctx: EvalCtx, refs: Record<string, string>): Record<string, string> | undefined {
  const assigns: Record<string, string> = {};
  for (const ref of Object.values(refs)) {
    const raw = ctx.pointAssignLines.get(ref);
    if (raw && isWritablePointAssign(raw)) assigns[ref] = raw;
  }
  return Object.keys(assigns).length > 0 ? assigns : undefined;
}

function evalPointExprWithRef(ctx: EvalCtx, expr: string): PointEval | null {
  const t = peelOuterParens(expr.trim());
  const direct = t.match(/^[a-zA-Z_]\w*(?:\[\d+\])?$/);
  if (direct) {
    const p = ctx.pointVars.get(t);
    if (p) return { p, ref: t };
  }
  const p = evalPointExpr(ctx, expr);
  if (!p) return null;
  return { p, ref: findUniquePointRef(ctx, p) };
}

function refsFromPointEvals(
  ctx: EvalCtx,
  entries: Array<[string, PointEval]>,
): { pointRefs?: Record<string, string>; pointRefAssigns?: Record<string, string> } {
  const refs: Record<string, string> = {};
  for (const [handle, item] of entries) {
    if (item.ref) refs[handle] = item.ref;
  }
  if (Object.keys(refs).length === 0) return {};
  return {
    pointRefs: refs,
    pointRefAssigns: pointRefAssigns(ctx, refs),
  };
}

function parseCoordExpr(ctx: EvalCtx, expr: string): LPoint | null {
  let t = expr.trim();
  if (t.startsWith("(") && isWholeWrappedInParens(t)) t = t.slice(1, -1).trim();
  const comma = splitTopLevelChar(t, ",");
  if (!comma) return null;
  const x = evalScalarExpr(ctx, comma[0]);
  const y = evalScalarExpr(ctx, comma[1]);
  return x !== null && y !== null ? { x, y } : null;
}

function evalDashPathWithRefs(ctx: EvalCtx, expr: string): PathEval | null {
  let t = peelOuterParens(stripScaledU(expr.trim()));
  if (!t) return null;
  let closed = false;
  if (/--cycle\s*$/i.test(t)) {
    closed = true;
    t = t.replace(/--cycle\s*$/i, "").trim();
  }
  if (!t.includes("--")) return null;
  const tokens = splitOnDoubleDash(t);
  if (tokens.length < 2) return null;
  const pts: LPoint[] = [];
  const entries: Array<[string, PointEval]> = [];
  for (let i = 0; i < tokens.length; i++) {
    const item = evalPointExprWithRef(ctx, tokens[i]!.trim());
    if (!item) return null;
    pts.push(item.p);
    entries.push([`p${i}`, item]);
  }
  const refs = refsFromPointEvals(ctx, entries);
  return { pts, closed, refs: refs.pointRefs, assigns: refs.pointRefAssigns };
}

function remapPointRefs(
  parsed: PathEval,
  handles: string[],
): { pointRefs?: Record<string, string>; pointRefAssigns?: Record<string, string> } {
  if (!parsed.refs) return {};
  const refs: Record<string, string> = {};
  for (let i = 0; i < handles.length; i++) {
    const ref = parsed.refs[`p${i}`];
    if (ref) refs[handles[i]!] = ref;
  }
  return {
    pointRefs: Object.keys(refs).length > 0 ? refs : undefined,
    pointRefAssigns: parsed.assigns,
  };
}

function sourceHasScaledU(expr: string): boolean {
  return /\bscaled\s+u\s*$/i.test(expr.trim());
}

function evalPathValue(ctx: EvalCtx, expr: string): PathValue | null {
  let t = peelOuterParens(stripScaledU(expr.trim()));
  if (!t) return null;

  const shifted = splitTopLevelKeyword(t, "shifted", true);
  if (shifted) {
    const path = evalPathValue(ctx, shifted[0]);
    const delta = evalPointExpr(ctx, shifted[1]);
    if (!path || !delta) return null;
    return {
      ...path,
      pts: path.pts.map((p) => addPoints(p, delta)),
    };
  }

  const shape = /^[a-zA-Z_]\w*(?:\[\d+\])?$/.test(t) ? resolvePathVar(ctx, t) : null;
  if (shape) return pathShapePoints(shape);

  if (/--/.test(t)) {
    const tokens = splitOnDoubleDash(t.replace(/--cycle\s*$/i, ""));
    const pts = tokens.map((tok) => evalPointExpr(ctx, tok)).filter((p): p is LPoint => !!p);
    if (pts.length === tokens.length && pts.length >= 2) {
      return { pts, closed: /--cycle\s*$/i.test(t) };
    }
  }

  return null;
}

function evalPointAssignment(
  ctx: EvalCtx,
  line: string,
): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*(?::=|=)\s*point\s+([\s\S]+?)\s+of\s+([a-zA-Z_]\w*(?:\[\d+\])?)$/i);
  if (!m) return false;
  const time = evalScalarExpr(ctx, m[2].trim());
  const p = time !== null ? pointOnPathVar(ctx, m[3], time) : null;
  if (!p) return false;
  const key = m[1];
  ctx.pointVars.set(key, p);
  ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
  pushMacro(ctx, line, key.replace(/\[\d+\]$/, ""));
  return true;
}

function evalNumericAssignment(
  ctx: EvalCtx,
  line: string,
): boolean {
  const trimmed = line.replace(/;\s*$/, "");
  const mIdx = trimmed.match(/^([a-zA-Z_]\w*)\[(\d+)\]\s*(?::=|=)\s*(.+)$/);
  if (mIdx) {
    const rhs = mIdx[3].trim();
    if (rhs.startsWith("(") && rhs.includes(",")) return false;
    const val = evalScalarExpr(ctx, rhs);
    if (val === null) return false;
    const base = mIdx[1];
    const idx = mIdx[2];
    ctx.numericVars.set(`${base}[${idx}]`, val);
    ctx.numericVars.set(`${base}${idx}`, val);
    pushMacro(ctx, line, base);
    return true;
  }
  const m = trimmed.match(/^([a-zA-Z_]\w*)\s*(?::=|=)\s*(.+)$/);
  if (!m) return false;
  const rhs = m[2].trim();
  if (/^(fullcircle|halfcircle|path)\b/i.test(rhs)) return false;
  if (/rotated\b/i.test(rhs)) return false;
  if (/\[.+,.*\]/.test(rhs)) return false;
  if (rhs.includes("(") && rhs.includes(",") && !/^sqrt\(/i.test(rhs)) return false;
  const val = evalScalarExpr(ctx, rhs);
  if (val === null) return false;
  ctx.numericVars.set(m[1], val);
  pushMacro(ctx, line, m[1]);
  return true;
}

function evalPairExpressionAssignment(ctx: EvalCtx, line: string): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*(?::=|=)\s*(.+)$/);
  if (!m) return false;
  const rhs = m[2].trim();
  if (/^(fullcircle|halfcircle|path|whatever)\b/i.test(rhs)) return false;
  const p = evalPointExpr(ctx, rhs);
  if (!p) return false;
  const key = m[1];
  ctx.pointVars.set(key, p);
  ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
  pushMacro(ctx, line, key.replace(/\[\d+\]$/, ""));
  return true;
}

function evalColonPairAssignment(
  ctx: EvalCtx,
  line: string,
): boolean {
  const m = line.replace(/;\s*$/, "").match(/^([a-zA-Z_]\w*)\s*:=\s*(.+)$/);
  if (!m) return false;
  const rhs = m[2].trim();
  if (/^(fullcircle|halfcircle|path)\b/i.test(rhs)) return false;
  const key = m[1];
  const rot = rhs.match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s+rotated\s+(-?[\d.]+)$/i);
  if (rot) {
    const base = resolvePointArg(rot[1], ctx.pointVars, ctx.numericVars);
    const deg = parseFloat(rot[2]);
    if (!base || !Number.isFinite(deg)) return false;
    ctx.pointVars.set(key, rotatePoint(base, deg));
    ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
    pushMacro(ctx, line, key);
    return true;
  }
  const addM = rhs.match(/^(.+?)\s*\+\s*([a-zA-Z_]\w*)$/);
  if (addM) {
    const a =
      parseCoordToken(addM[1].trim(), ctx.numericVars) ??
      resolvePointArg(addM[1].trim(), ctx.pointVars, ctx.numericVars);
    const b = resolvePointArg(addM[2].trim(), ctx.pointVars, ctx.numericVars);
    if (!a || !b) return false;
    ctx.pointVars.set(key, { x: a.x + b.x, y: a.y + b.y });
    ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
    pushMacro(ctx, line, key);
    return true;
  }
  const interpAssign = rhs.match(/^(.+)\s*\[([^,\]]+)\s*,\s*([^\]]+)\]\s*$/);
  if (interpAssign && !rhs.includes("..")) {
    const fracPart = interpAssign[1].trim();
    const frac =
      evalNumeric(fracPart, ctx.numericVars) ?? parseScalar(fracPart, ctx.numericVars);
    const a = resolvePointArg(interpAssign[2].trim(), ctx.pointVars, ctx.numericVars);
    const b = resolvePointArg(interpAssign[3].trim(), ctx.pointVars, ctx.numericVars);
    if (frac !== null && a && b) {
      ctx.pointVars.set(key, interpPoints(frac, a, b));
      ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
      pushMacro(ctx, line, key);
      return true;
    }
  }
  const scaleM = rhs.match(/^(.+?)\*\s*\(\s*([^)]+?)\s*-\s*([^)]+?)\s*\)\s*$/);
  if (scaleM) {
    const k =
      evalNumeric(scaleM[1].trim(), ctx.numericVars) ??
      parseScalar(scaleM[1].trim(), ctx.numericVars);
    const p1 = resolvePointArg(scaleM[2].trim(), ctx.pointVars, ctx.numericVars);
    const p2 = resolvePointArg(scaleM[3].trim(), ctx.pointVars, ctx.numericVars);
    if (k !== null && p1 && p2) {
      ctx.pointVars.set(key, { x: k * (p1.x - p2.x), y: k * (p1.y - p2.y) });
      ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
      pushMacro(ctx, line, key);
      return true;
    }
  }
  if (/^[a-zA-Z_]\w*(?:\[\d+\])?$/.test(rhs)) {
    const copy = resolvePointArg(rhs, ctx.pointVars, ctx.numericVars);
    if (copy) {
      ctx.pointVars.set(key, { x: copy.x, y: copy.y });
      ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
      pushMacro(ctx, line, key);
      return true;
    }
  }
  const p = parseCoordToken(rhs, ctx.numericVars);
  if (!p) return false;
  ctx.pointVars.set(key, p);
  ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
  pushMacro(ctx, line, key);
  return true;
}

function evalPlainPairAssignment(
  ctx: EvalCtx,
  line: string,
): boolean {
  const m = line.replace(/;\s*$/, "").match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (!m) return false;
  const rhs = m[2].trim();
  if (/^(fullcircle|halfcircle|path|whatever)\b/i.test(rhs)) return false;
  if (rhs.includes("..") || /--/.test(rhs)) return false;
  const p = resolvePointArg(rhs, ctx.pointVars) ?? parseCoordToken(rhs);
  if (!p) return false;
  const key = m[1];
  ctx.pointVars.set(key, p);
  ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
  pushMacro(ctx, line, key);
  return true;
}

/** A=whatever[p,q]=whatever[r,s] — intersection of two lines. */
function evalWhateverPairAssignment(
  ctx: EvalCtx,
  line: string,
): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(
      /^([a-zA-Z_]\w*)\s*(?::=|=)\s*whatever\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]\s*=\s*whatever\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\s*\]\s*$/i,
    );
  if (!m) return false;
  const a = resolvePointArg(m[2].trim(), ctx.pointVars, ctx.numericVars);
  const b = resolvePointArg(m[3].trim(), ctx.pointVars, ctx.numericVars);
  const c = resolvePointArg(m[4].trim(), ctx.pointVars, ctx.numericVars);
  const d = resolvePointArg(m[5].trim(), ctx.pointVars, ctx.numericVars);
  if (!a || !b || !c || !d) return false;
  const p = lineIntersection(a, b, c, d);
  if (!p) return false;
  const key = m[1];
  ctx.pointVars.set(key, p);
  ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
  pushMacro(ctx, line, key);
  return true;
}

function evalNamedDrawPath(
  ctx: EvalCtx,
  core: string,
  style: ShapeStyle,
): boolean {
  const dm = core.match(/^(draw|drawarrow|filldraw)\s+(.+)$/i);
  if (!dm || core.includes("..") || /fullcircle|halfcircle/i.test(core)) return false;
  let path = peelOuterParens(stripScaledU(dm[2].trim()));
  const cmd = dm[1].toLowerCase();
  let closed = false;
  if (/--cycle\s*$/i.test(path)) {
    closed = true;
    path = path.replace(/--cycle\s*$/i, "").trim();
  }
  const tokens = splitOnDoubleDash(path);
  if (tokens.length < 2) return false;
  const parsed = evalDashPathWithRefs(ctx, path);
  if (!parsed) return false;
  const pts = parsed.pts;
  if (cmd === "drawarrow" && pts.length === 2) {
    const refs = remapPointRefs(parsed, ["a", "b"]);
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "arrow",
        a: pts[0],
        b: pts[1],
        sourceScaled: sourceHasScaledU(dm[2]),
        ...refs,
      },
      style,
    );
    return true;
  }
  if (pts.length === 2) {
    const refs = remapPointRefs(parsed, ["a", "b"]);
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "segment",
        a: pts[0],
        b: pts[1],
        sourceScaled: sourceHasScaledU(dm[2]),
        ...refs,
      },
      { ...style, fill: cmd === "filldraw" },
    );
    return true;
  }
  if (closed && pts.length >= 3) {
    const refs = remapPointRefs(parsed, pts.map((_, i) => `p${i}`));
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "polyline",
        pts,
        closed: true,
        sourceScaled: sourceHasScaledU(dm[2]),
        ...refs,
      },
      { ...style, fill: cmd === "filldraw" },
    );
    return true;
  }
  const refs = remapPointRefs(parsed, pts.map((_, i) => `p${i}`));
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "polyline",
      pts,
      sourceScaled: sourceHasScaledU(dm[2]),
      ...refs,
    },
    { ...style, fill: cmd === "filldraw" },
  );
  return true;
}

function evalCoordPointAssignment(
  ctx: EvalCtx,
  line: string,
): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(/^([a-zA-Z_]\w*)\[(\d+)\]\s*(?::=|=)\s*(.+)$/);
  if (!m) return false;
  const rhs = m[3].trim();
  if (/^point\s+\d+\s+of\s+/i.test(rhs)) return false;
  if (/^(fullcircle|halfcircle)\b/i.test(rhs)) return false;
  const p = evalPointExpr(ctx, rhs);
  if (!p) return false;
  const key = `${m[1]}[${m[2]}]`;
  ctx.pointVars.set(key, p);
  ctx.pointAssignLines.set(key, line.replace(/;\s*$/, ""));
  pushMacro(ctx, line, m[1]);
  return true;
}

function evalBuiltinPathAssignment(
  ctx: EvalCtx,
  line: string,
  style: ShapeStyle,
): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(
      /^([a-zA-Z_]\w*(?:\[\d+\])?)\s*(?::=|=)\s*(fullcircle|halfcircle)\s+scaled\s+(.+?)(?:\s+shifted\s+(.+))?$/i,
    );
  if (!m) return false;
  const pathVar = m[1];
  const builtin = m[2].toLowerCase() as "fullcircle" | "halfcircle";
  const scaleExpr = m[3].trim();
  const scale = evalScalarExpr(ctx, scaleExpr);
  const shiftArg = m[4]?.trim();
  const pathAssign = `${builtin} scaled ${scaleExpr}${shiftArg ? ` shifted ${shiftArg}` : ""}`;
  const center = shiftArg ? evalPointExprWithRef(ctx, shiftArg) : { p: { x: 0, y: 0 } };
  const r = scale !== null ? circleScaleToRadius(scale) : null;
  if (r === null || r <= 0 || !center) {
    pushMacro(ctx, line, m[1]);
    return true;
  }
  const refs = refsFromPointEvals(ctx, [["center", center]]);
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "circle",
      center: center.p,
      r,
      pathVar,
      pathAssign,
      circleBuiltin: builtin,
      ...refs,
    },
    style,
  );
  return true;
}

function evalSimplePathCircleAssignment(
  ctx: EvalCtx,
  line: string,
  style: ShapeStyle,
): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(/^([a-zA-Z_]\w*)\s*(?::=|=)\s*(fullcircle|halfcircle)\s+scaled\s+([\d./]+)\s*(cm|mm|u|bp|pt)?$/i);
  if (!m) return false;
  const pathVar = m[1];
  const scale = parseScalar(m[3] + (m[4] ?? "u"));
  const r = scale !== null ? circleScaleToRadius(scale) : null;
  if (r === null || r <= 0) return false;
  const builtin = m[2].toLowerCase() as "fullcircle" | "halfcircle";
  const pathAssign = `${builtin} scaled ${m[3]}${m[4] ?? "u"}`;
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "circle",
      center: { x: 0, y: 0 },
      r,
      pathVar,
      pathAssign,
      circleBuiltin: builtin,
    },
    style,
  );
  return true;
}

function evalPolyPathVarAssignment(
  ctx: EvalCtx,
  line: string,
  style: ShapeStyle,
): boolean {
  const m = line.replace(/;\s*$/, "").match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*(?::=|=)\s*(.+)$/);
  if (!m) return false;
  let path = m[2].trim();
  if (!path.includes("--") || path.includes("..")) return false;
  let closed = false;
  if (/--cycle\s*$/i.test(path)) {
    closed = true;
    path = path.replace(/--cycle\s*$/i, "").trim();
  }
  const tokens = splitOnDoubleDash(path);
  if (tokens.length < 2) return false;
  const pts: LPoint[] = [];
  for (const tok of tokens) {
    const p = evalPointExpr(ctx, tok.trim());
    if (!p) return false;
    pts.push(p);
  }
  const pathVar = m[1];
  if (closed && pts.length >= 3) {
    pushPrimitive(ctx,
      { id: newId(), layer: "primitive", kind: "polyline", pts, closed: true, pathVar },
      style,
    );
    return true;
  }
  if (pts.length >= 2) {
    pushPrimitive(ctx,
      { id: newId(), layer: "primitive", kind: "polyline", pts, pathVar },
      style,
    );
    return true;
  }
  return false;
}

function evalDrawPathRef(
  ctx: EvalCtx,
  core: string,
  style: ShapeStyle,
): boolean {
  const m = core.match(/^draw\s+([a-zA-Z_]\w*)(\[\d+\])?\s*$/i);
  if (!m) return false;
  const pathVar = m[2] ? `${m[1]}${m[2]}` : m[1];
  const prim = findPathPrimitive(ctx.shapes, pathVar);
  if (!prim || prim.layer !== "primitive") return false;
  if (Object.keys(style).length > 0) {
    prim.style = { ...prim.style, ...style };
  }
  return true;
}

function evalDotlabel(
  ctx: EvalCtx,
  line: string,
  style: ShapeStyle,
): boolean {
  const m = line
    .replace(/;\s*$/, "")
    .match(/^dotlabel(?:\.(\w+))?\s*\(\s*(btex[\s\S]*?etex)\s*,\s*(.+)\)$/i);
  if (!m) return false;
  const posArg = m[3].trim();
  const p = evalPointExpr(ctx, posArg);
  if (!p) return false;

  let pointAssign: string | undefined;
  const varM = posArg.match(/^([a-zA-Z_]\w*)\[(\d+)\]$/);
  if (varM) {
    const varKey = `${varM[1]}[${varM[2]}]`;
    pointAssign = ctx.pointAssignLines.get(varKey);
  }

  const raw = line.replace(/;\s*$/, "");
  const pointRefs = varM ? { p: `${varM[1]}[${varM[2]}]` } : undefined;
  const pointRefAssigns =
    pointAssign && pointRefs && isWritablePointAssign(pointAssign)
      ? { [pointRefs.p]: pointAssign }
      : undefined;
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "dot",
      p,
      pointAssign,
      dotlabel: raw,
      pointRefs,
      pointRefAssigns,
    },
    style,
  );
  return true;
}

function evalDrawPointWithPen(
  ctx: EvalCtx,
  core: string,
  style: ShapeStyle,
): boolean {
  if (!style.withpen && !style.dashed) return false;
  const m = core.match(/^draw\s+(.+)$/i);
  if (!m) return false;
  const arg = m[1].trim();
  if (/--|\.\.|fullcircle|halfcircle|cycle|controls/i.test(arg)) return false;
  const point = evalPointExprWithRef(ctx, arg);
  if (!point) return false;
  const refs = refsFromPointEvals(ctx, [["p", point]]);
  pushPrimitive(ctx, { id: newId(), layer: "primitive", kind: "dot", p: point.p, ...refs }, style);
  return true;
}

function evalDot(
  ctx: EvalCtx,
  core: string,
  style: ShapeStyle,
): boolean {
  let m = core.match(/^drawdot\s*(\([^)]+\))(?:\s+scaled\s+u)?$/i);
  if (m) {
    const p = evalPointExprWithRef(ctx, m[1]);
    if (!p) return false;
    const refs = refsFromPointEvals(ctx, [["p", p]]);
    pushPrimitive(ctx, { id: newId(), layer: "primitive", kind: "dot", p: p.p, ...refs }, style);
    return true;
  }
  m = core.match(/^drawdot\s+(.+?)(?:\s+scaled\s+u)?$/i);
  if (m) {
    const p = evalPointExprWithRef(ctx, m[1]);
    if (!p) return false;
    const refs = refsFromPointEvals(ctx, [["p", p]]);
    pushPrimitive(ctx, { id: newId(), layer: "primitive", kind: "dot", p: p.p, ...refs }, style);
    return true;
  }
  return false;
}

function evalCircle3(ctx: EvalCtx, core: string, style: ShapeStyle): boolean {
  const path = extractDrawPathBody(core);
  if (!path) return false;
  const m = path.match(/^(.+?)\.\.(.+?)\.\.(.+?)\.\.cycle$/i);
  if (!m) return false;
  const a = evalPointExprWithRef(ctx, m[1]);
  const b = evalPointExprWithRef(ctx, m[2]);
  const c = evalPointExprWithRef(ctx, m[3]);
  if (!a || !b || !c) return false;
  const refs = refsFromPointEvals(ctx, [["a", a], ["b", b], ["c", c]]);
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "circle3",
      a: a.p,
      b: b.p,
      c: c.p,
      sourceScaled: sourceHasScaledU(core),
      ...refs,
    },
    { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
  );
  return true;
}

function evalBezier(ctx: EvalCtx, core: string, style: ShapeStyle): boolean {
  const path = extractDrawPathBody(core);
  if (!path || !/\.\.\s*controls\b/i.test(path)) return false;
  const m = path.match(/^(.+?)\.\.\s*controls\s+(.+?)\s+and\s+(.+?)\s*\.\.\s*(.+)$/i);
  if (!m) return false;
  const a = evalPointExprWithRef(ctx, m[1]);
  const b = evalPointExprWithRef(ctx, m[2]);
  const c = evalPointExprWithRef(ctx, m[3]);
  const d = evalPointExprWithRef(ctx, m[4]);
  if (!a || !b || !c || !d) return false;
  const refs = refsFromPointEvals(ctx, [["a", a], ["b", b], ["c", c], ["d", d]]);
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "bezier",
      a: a.p,
      b: b.p,
      c: c.p,
      d: d.p,
      sourceScaled: sourceHasScaledU(core),
      ...refs,
    },
    { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
  );
  return true;
}

function parseMpathNode(ctx: EvalCtx, token: string): MPathNode | null {
  const t = token.trim();
  const braceM = t.match(/^(.+?)\{dir\s+([^}]+)\}\s*$/i);
  if (braceM) {
    const p = evalPointExpr(ctx, braceM[1].trim());
    const angle = evalScalarExpr(ctx, braceM[2].trim());
    if (p && angle !== null) return { p, dir: angle };
    return null;
  }
  const vecDirM = t.match(/^(.+?)\{\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*\}\s*$/);
  if (vecDirM) {
    const p = evalPointExpr(ctx, vecDirM[1].trim());
    const dx = evalScalarExpr(ctx, vecDirM[2]);
    const dy = evalScalarExpr(ctx, vecDirM[3]);
    if (p && dx !== null && dy !== null) {
      return { p, dir: (Math.atan2(dy, dx) * 180) / Math.PI };
    }
    return null;
  }
  const curlM = t.match(/^(.+?)\{curl\s+([^}]+)\}\s*$/i);
  if (curlM) {
    const p = evalPointExpr(ctx, curlM[1].trim());
    const curl = evalScalarExpr(ctx, curlM[2].trim());
    if (p && curl !== null) return { p, dir: curl * 45 };
    return null;
  }
  const vectorBraceM = t.match(/^(.+?)\{\s*([^}]+)\s*\}\s*$/);
  if (vectorBraceM) {
    const p = evalPointExpr(ctx, vectorBraceM[1].trim());
    const d = evalPointExpr(ctx, vectorBraceM[2].trim());
    if (p && d) return { p, dir: (Math.atan2(d.y, d.x) * 180) / Math.PI };
    return null;
  }
  const legacyM = t.match(/^(.+?)\s+dir\s+(.+)$/i);
  if (legacyM) {
    const p = evalPointExpr(ctx, legacyM[1].trim());
    const d = evalPointExpr(ctx, legacyM[2].trim());
    if (p && d) {
      const angle = (Math.atan2(d.y, d.x) * 180) / Math.PI;
      return { p, dir: angle };
    }
    return null;
  }
  const p = evalPointExpr(ctx, t);
  return p ? { p } : null;
}

function normalizeMpathBody(body: string): string {
  return body.replace(/---/g, "..");
}

function parseMpathBody(
  ctx: EvalCtx,
  body: string,
): { nodes: MPathNode[]; closed: boolean } | null {
  if (/\.\.controls\b/i.test(body)) return null;

  let pathBody = normalizeMpathBody(body);
  let closed = false;
  if (/\s*\.\.\s*cycle\s*$/i.test(pathBody)) {
    pathBody = pathBody.replace(/\s*\.\.\s*cycle\s*$/i, "").trim();
    closed = true;
  } else if (!pathBody.includes("..")) {
    return null;
  }

  const tokens = splitOnDoubleDot(pathBody);
  if (tokens.length < 2) return null;
  const nodes: MPathNode[] = [];
  for (const tok of tokens) {
    const n = parseMpathNode(ctx, tok);
    if (!n) return null;
    nodes.push(n);
  }
  return { nodes, closed };
}

function evalMpath(
  ctx: EvalCtx,
  core: string,
  style: ShapeStyle,
): boolean {
  const path = extractDrawPathBody(core);
  if (!path) return false;
  const parsed = parseMpathBody(ctx, path);
  if (!parsed) return false;
  pushPrimitive(ctx,
    { id: newId(), layer: "primitive", kind: "mpath", nodes: parsed.nodes, closed: parsed.closed },
    { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
  );
  return true;
}

function evalPathAssignment(ctx: EvalCtx, line: string, style: ShapeStyle): boolean {
  const m = line.replace(/;\s*$/, "").match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*(?::=|=)\s*(.+)$/);
  if (!m) return false;
  const rhs = m[2].trim();
  if (/^(fullcircle|halfcircle)\b/i.test(rhs)) return false;
  const pathVar = m[1];
  let pathBody = stripScaledU(rhs);
  pathBody = peelOuterParens(pathBody);
  const parsed = parseMpathBody(ctx, pathBody);
  if (!parsed) return false;
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "mpath",
      nodes: parsed.nodes,
      closed: parsed.closed,
      pathVar,
    },
    style,
  );
  return true;
}

function evalCircleScaled(ctx: EvalCtx, core: string, style: ShapeStyle): boolean {
  let m = core.match(
    /^(?:draw|filldraw)\s+fullcircle\s+scaled\s+([\d./]+|\([^)]+\))\s*(cm|mm|u|bp|pt)?\s+shifted\s+(.+?)(?:\s+scaled\s+u)?$/i,
  );
  if (m) {
    const scale = evalScalarExpr(ctx, m[1].includes("(") ? m[1] : m[1] + (m[2] ?? "u"));
    const r = scale !== null ? circleScaleToRadius(scale) : null;
    const center = evalPointExprWithRef(ctx, m[3]);
    if (r === null || !center || r <= 0) return false;
    const refs = refsFromPointEvals(ctx, [["center", center]]);
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "circle",
        center: center.p,
        r,
        sourceScaled: sourceHasScaledU(core),
        ...refs,
      },
      { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
    );
    return true;
  }

  m = core.match(/^(?:draw|filldraw)\s+fullcircle\s+scaled\s+([\d./]+|\([^)]+\))\s*(cm|mm|u|bp|pt)?\s*$/i);
  if (m) {
    const scale = evalScalarExpr(ctx, m[1].includes("(") ? m[1] : m[1] + (m[2] ?? "u"));
    const r = scale !== null ? circleScaleToRadius(scale) : null;
    if (r === null || r <= 0) return false;
    pushPrimitive(ctx,
      { id: newId(), layer: "primitive", kind: "circle", center: { x: 0, y: 0 }, r },
      { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
    );
    return true;
  }

  if (/^(?:draw|filldraw)\s+fullcircle\s*$/i.test(core.trim())) {
    pushPrimitive(ctx,
      { id: newId(), layer: "primitive", kind: "circle", center: { x: 0, y: 0 }, r: 0.5 },
      { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
    );
    return true;
  }

  return false;
}

function evalEllipseScaled(ctx: EvalCtx, core: string, style: ShapeStyle): boolean {
  const m = core.match(
    /^(?:draw|filldraw)\s+fullcircle\s+xscaled\s+([\d./]+)\s*u\s+yscaled\s+([\d./]+)\s*u\s+shifted\s+(.+?)(?:\s+scaled\s+u)?$/i,
  );
  if (!m) return false;
  const xscale = evalScalarExpr(ctx, `${m[1]}u`);
  const yscale = evalScalarExpr(ctx, `${m[2]}u`);
  const rx = xscale !== null ? xscale / 2 : null;
  const ry = yscale !== null ? yscale / 2 : null;
  const center = evalPointExprWithRef(ctx, m[3]);
  if (rx === null || ry === null || !center || rx <= 0 || ry <= 0) return false;
  const refs = refsFromPointEvals(ctx, [["center", center]]);
  pushPrimitive(ctx,
    {
      id: newId(),
      layer: "primitive",
      kind: "ellipse",
      center: center.p,
      rx,
      ry,
      sourceScaled: sourceHasScaledU(core),
      ...refs,
    },
    { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
  );
  return true;
}

function evalArrow(ctx: EvalCtx, core: string, style: ShapeStyle): boolean {
  const m = core.match(/^drawarrow\s+(.+)$/i);
  if (!m) return false;
  const parsed = evalDashPathWithRefs(ctx, m[1]);
  if (parsed && parsed.pts.length >= 2) {
    const refs = remapPointRefs(parsed, ["a", "b"]);
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "arrow",
        a: parsed.pts[0]!,
        b: parsed.pts[parsed.pts.length - 1]!,
        sourceScaled: sourceHasScaledU(m[1]),
        ...refs,
      },
      style,
    );
    return true;
  }
  const path = evalPathValue(ctx, m[1]);
  const ends = path && path.pts.length >= 2
    ? { a: path.pts[0]!, b: path.pts[path.pts.length - 1]! }
    : parseTwoPointPath(m[1], ctx.numericVars);
  if (!ends) return false;
  pushPrimitive(ctx,
    { id: newId(), layer: "primitive", kind: "arrow", a: ends.a, b: ends.b },
    style,
  );
  return true;
}

function evalSegment(ctx: EvalCtx, core: string, style: ShapeStyle): boolean {
  const m = core.match(/^(?:draw|filldraw)\s+(.+)$/i);
  if (!m || core.includes("..") || core.includes("fullcircle") || /\.\.cycle/i.test(core)) {
    return false;
  }
  let pathPart = m[1].trim();
  let closed = false;
  if (/--cycle\s*$/i.test(pathPart)) {
    closed = true;
    pathPart = pathPart.replace(/--cycle\s*$/i, "").trim();
  }
  const parsed = evalDashPathWithRefs(ctx, pathPart);
  const path = parsed ? null : evalPathValue(ctx, pathPart);
  const pts = parsed?.pts ?? path?.pts ?? parsePathPoints(pathPart, ctx.numericVars);
  closed = closed || !!parsed?.closed || !!path?.closed;
  if (pts.length === 2) {
    const refs = parsed ? remapPointRefs(parsed, ["a", "b"]) : {};
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "segment",
        a: pts[0],
        b: pts[1],
        sourceScaled: sourceHasScaledU(m[1]),
        ...refs,
      },
      { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
    );
    return true;
  }
  if (pts.length > 2) {
    const refs = parsed ? remapPointRefs(parsed, pts.map((_, i) => `p${i}`)) : {};
    pushPrimitive(ctx,
      {
        id: newId(),
        layer: "primitive",
        kind: "polyline",
        pts,
        ...(closed ? { closed: true } : {}),
        sourceScaled: sourceHasScaledU(m[1]),
        ...refs,
      },
      { ...style, fill: style.fill ?? /^filldraw/i.test(core) },
    );
    return true;
  }
  return false;
}

/** All draw statements: evalPathExpr → journal (+ editable primitive when recognized). */
function evalPathExpr(ctx: EvalCtx, op: string, pathExpr: string, style: ShapeStyle): boolean {
  const core = `${op} ${pathExpr}`;
  if (op === "drawdot") return evalDot(ctx, core, style);
  if (op === "draw") {
    if (/^[a-zA-Z_]\w*(\[\d+\])?\s*$/.test(pathExpr.trim()) && evalDrawPathRef(ctx, core, style)) {
      return true;
    }
    if (evalDrawPointWithPen(ctx, core, style)) return true;
  }
  if (evalNamedDrawPath(ctx, core, style)) return true;
  if (op === "filldraw") {
    const pm = core.match(/^filldraw\s+fullcircle\s+scaled\s+[\d.]+pt\s+shifted\s+(.+?)(?:\s+scaled\s+u)?$/i);
    if (pm) {
      const p = evalPointExprWithRef(ctx, pm[1]);
      if (p) {
        const refs = refsFromPointEvals(ctx, [["p", p]]);
        pushPrimitive(ctx, { id: newId(), layer: "primitive", kind: "point", p: p.p, ...refs }, style);
        return true;
      }
    }
  }
  if (evalCircle3(ctx, core, style)) return true;
  if (evalBezier(ctx, core, style)) return true;
  if (evalMpath(ctx, core, style)) return true;
  if (evalCircleScaled(ctx, core, style)) return true;
  if (evalEllipseScaled(ctx, core, style)) return true;
  if (op === "drawarrow" && evalArrow(ctx, core, style)) return true;
  if (evalSegment(ctx, core, style)) return true;
  const rectM = core.match(
    /^(?:draw|filldraw)\s+\(([^)]+)\)--\(([^)]+)\)--\(([^)]+)\)--\(([^)]+)\)--cycle(?:\s+scaled\s+u)?$/i,
  );
  if (rectM) {
    const a = parsePair(`(${rectM[1]})`, ctx.numericVars);
    const c = parsePair(`(${rectM[3]})`, ctx.numericVars);
    if (a && c) {
      pushPrimitive(ctx, { id: newId(), layer: "primitive", kind: "rect", a, b: c }, {
        ...style,
        fill: style.fill ?? /^filldraw/i.test(core),
      });
      return true;
    }
  }
  const circM = core.match(
    /^(?:draw|filldraw)\s+fullcircle\s+\(([\d.]+)\*u\)\s+shifted\s+\(([\d.]+)\*u,([\d.]+)\*u\)$/i,
  );
  if (circM) {
    pushPrimitive(ctx, {
      id: newId(),
      layer: "primitive",
      kind: "circle",
      center: { x: parseFloat(circM[2]), y: parseFloat(circM[3]) },
      r: circleScaleToRadius(parseFloat(circM[1])),
    }, { ...style, fill: style.fill ?? /^filldraw/i.test(core) });
    return true;
  }
  const ellM = core.match(
    /^(?:draw|filldraw)\s+fullcircle\s+xscaled\s+\(([\d.]+)\*u\)\s+yscaled\s+\(([\d.]+)\*u\)\s+shifted\s+\(([\d.]+)\*u,([\d.]+)\*u\)$/i,
  );
  if (ellM) {
    pushPrimitive(ctx, {
      id: newId(),
      layer: "primitive",
      kind: "ellipse",
      center: { x: parseFloat(ellM[3]), y: parseFloat(ellM[4]) },
      rx: parseFloat(ellM[1]) / 2,
      ry: parseFloat(ellM[2]) / 2,
    }, { ...style, fill: style.fill ?? /^filldraw/i.test(core) });
    return true;
  }
  return false;
}

function pushPreviewArrow(
  ctx: EvalCtx,
  sourceMacro: string,
  origin: LPoint,
  len: number,
  angle: number,
  scale = 1,
): void {
  const a = addPoints(origin, rotatePoint({ x: -0.2 * len * scale, y: 0 }, angle));
  const b = addPoints(origin, rotatePoint({ x: 0.8 * len * scale, y: 0 }, angle));
  pushPrimitive(ctx, {
    id: newId(),
    layer: "primitive",
    kind: "arrow",
    a,
    b,
    previewOnly: true,
    sourceMacro,
  }, {});
}

function fmtPreviewNum(n: number): string {
  return Number(n.toFixed(6)).toString();
}

function fmtPreviewPoint(p: LPoint): string {
  return `(${fmtPreviewNum(p.x)},${fmtPreviewNum(p.y)})`;
}

function evalPreviewLength(ctx: EvalCtx, expr: string): number | null {
  const raw = expr.trim();
  const val = evalScalarExpr(ctx, raw);
  if (val === null) return null;
  if (/(?:pt|bp)\s*$/i.test(raw) && !/\bu\b/i.test(raw)) return val / 10;
  return val;
}

function evalDrawgridMacro(ctx: EvalCtx, raw: string): boolean {
  const line = raw.replace(/;\s*$/, "");
  const m = line.match(/^drawgrid\s*\(([\s\S]*)\)$/i);
  if (!m) return false;
  const args = splitTopLevelArgs(m[1]);
  if (args.length !== 1) return false;
  const len = evalScalarExpr(ctx, args[0]);
  if (len === null || len <= 0) return false;

  pushMacro(ctx, line, "drawgrid");
  const min = Math.ceil(-len);
  const max = Math.floor(len);
  const cap = 80;
  if (max - min > cap) return true;
  const style: ShapeStyle = { dashed: "evenly scaled .5" };
  for (let i = min; i <= max; i++) {
    pushPrimitive(ctx, {
      id: newId(),
      layer: "primitive",
      kind: "segment",
      a: { x: -len, y: i },
      b: { x: len, y: i },
      previewOnly: true,
      sourceMacro: line,
    }, i % 5 === 0 ? { ...style, withpen: "pencircle scaled 1pt" } : style);
    pushPrimitive(ctx, {
      id: newId(),
      layer: "primitive",
      kind: "segment",
      a: { x: i, y: -len },
      b: { x: i, y: len },
      previewOnly: true,
      sourceMacro: line,
    }, i % 5 === 0 ? { ...style, withpen: "pencircle scaled 1pt" } : style);
  }
  return true;
}

function evalCoordtwoMacro(ctx: EvalCtx, raw: string): boolean {
  const line = raw.replace(/;\s*$/, "");
  const m = line.match(/^coordtwo\s*\(([\s\S]*)\)$/i);
  if (!m) return false;
  const args = splitTopLevelArgs(m[1]);
  if (args.length !== 4) return false;

  const origin = evalPointExpr(ctx, args[0]);
  const len = evalScalarExpr(ctx, args[1]);
  const dr = evalScalarExpr(ctx, args[2]);
  const dimension = evalScalarExpr(ctx, args[3]);
  if (!origin || len === null || dr === null || dimension === null) return false;

  pushMacro(ctx, line, "coordtwo");
  if (dimension > 0) pushPreviewArrow(ctx, line, origin, len, dr - 135, 0.5);
  if (Math.abs(dimension - 2) > 1e-12) pushPreviewArrow(ctx, line, origin, len, dr + 90);
  pushPreviewArrow(ctx, line, origin, len, dr);
  return true;
}

function evalArrowLabelMacro(ctx: EvalCtx, raw: string): boolean {
  const line = raw.replace(/;\s*$/, "");
  const m = line.match(/^arrow_label\s*\(([\s\S]*)\)$/i);
  if (!m) return false;
  const args = splitTopLevelArgs(m[1]);
  if (args.length !== 4) return false;

  const a = evalPointExpr(ctx, args[0]);
  const b = evalPointExpr(ctx, args[1]);
  if (!a || !b) return false;

  let offset = evalPreviewLength(ctx, args[3]);
  if (offset === null) {
    const offsetPoint = evalPointExpr(ctx, args[3]);
    offset = offsetPoint ? Math.hypot(offsetPoint.x, offsetPoint.y) : null;
  }
  if (offset === null) return false;

  const normal = normalizePoint(rotatePoint(subPoints(b, a), 90));
  if (!normal) return false;
  const delta = scalePoint(offset, normal);
  const start = addPoints(a, delta);
  const end = addPoints(b, delta);
  const mid = interpPoints(0.5, start, end);

  pushMacro(ctx, line, "arrow_label");
  pushPrimitive(ctx, {
    id: newId(),
    layer: "primitive",
    kind: "arrow",
    a: start,
    b: end,
    previewOnly: true,
    sourceMacro: line,
  }, {});
  pushPrimitive(ctx, {
    id: newId(),
    layer: "primitive",
    kind: "arrow",
    a: end,
    b: start,
    previewOnly: true,
    sourceMacro: line,
  }, {
    label: `label(${args[2]}, ${fmtPreviewPoint(mid)})`,
  });
  return true;
}

function normalizeArcDelta(delta: number): number {
  let d = delta;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}

function evalAngleMarkMacro(ctx: EvalCtx, raw: string): boolean {
  const line = raw.replace(/;\s*$/, "");
  const m = line.match(/^angle_mark\s*\(([\s\S]*)\)$/i);
  if (!m) return false;
  const args = splitTopLevelArgs(m[1]);
  if (args.length !== 6) return false;

  const a = evalPointExpr(ctx, args[0]);
  const o = evalPointExpr(ctx, args[1]);
  const b = evalPointExpr(ctx, args[2]);
  const radius = evalPreviewLength(ctx, args[3]);
  if (!a || !o || !b || radius === null || radius <= 0) return false;

  const va = subPoints(a, o);
  const vb = subPoints(b, o);
  if (Math.hypot(va.x, va.y) < 1e-12 || Math.hypot(vb.x, vb.y) < 1e-12) return false;

  const start = Math.atan2(va.y, va.x);
  const end = Math.atan2(vb.y, vb.x);
  const delta = normalizeArcDelta(end - start);
  const steps = 16;
  const pts: LPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = start + (delta * i) / steps;
    pts.push({
      x: o.x + radius * Math.cos(theta),
      y: o.y + radius * Math.sin(theta),
    });
  }

  const midTheta = start + delta / 2;
  const labelPoint = {
    x: o.x + (radius + 0.35) * Math.cos(midTheta),
    y: o.y + (radius + 0.35) * Math.sin(midTheta),
  };

  pushMacro(ctx, line, "angle_mark");
  pushPrimitive(ctx, {
    id: newId(),
    layer: "primitive",
    kind: "polyline",
    pts,
    previewOnly: true,
    sourceMacro: line,
  }, {
    withpen: "pencircle scaled 1/4",
    label: `label(${args[4]}, ${fmtPreviewPoint(labelPoint)})`,
  });
  return true;
}

function evalKnownMacro(ctx: EvalCtx, raw: string): boolean {
  return (
    evalDrawgridMacro(ctx, raw) ||
    evalCoordtwoMacro(ctx, raw) ||
    evalArrowLabelMacro(ctx, raw) ||
    evalAngleMarkMacro(ctx, raw)
  );
}

function evalAssignStmt(ctx: EvalCtx, stmt: Extract<Stmt, { kind: "assign" }>): boolean {
  const line = stmt.raw;
  if (evalBuiltinPathAssignment(ctx, line, {})) return true;
  if (evalSimplePathCircleAssignment(ctx, line, {})) return true;
  if (evalPathAssignment(ctx, line, {})) return true;
  if (evalPolyPathVarAssignment(ctx, line, {})) return true;
  if (evalPointAssignment(ctx, line)) return true;
  if (evalPairExpressionAssignment(ctx, line)) return true;
  if (evalNumericAssignment(ctx, line)) return true;
  if (evalColonPairAssignment(ctx, line)) return true;
  if (evalWhateverPairAssignment(ctx, line)) return true;
  if (evalPlainPairAssignment(ctx, line)) return true;
  if (evalCoordPointAssignment(ctx, line)) return true;
  pushMacro(ctx, line);
  return true;
}

function evalStmt(ctx: EvalCtx, stmt: Stmt): void {
  switch (stmt.kind) {
    case "drawOptions":
      break;
    case "decl":
      pushMacro(ctx, stmt.raw, stmt.declKind);
      break;
    case "assign":
      evalAssignStmt(ctx, stmt);
      break;
    case "draw":
      if (!evalPathExpr(ctx, stmt.op, stmt.pathExpr, stmt.style)) {
        pushMacro(ctx, stmt.raw);
      }
      break;
    case "dotlabel":
      if (!evalDotlabel(ctx, stmt.raw, {})) pushMacro(ctx, stmt.raw, "dotlabel");
      break;
    case "label":
      if (!attachLabel(ctx, stmt.body)) pushMacro(ctx, stmt.raw, "label");
      break;
    case "drawfun":
      ctx.shapes.push({ id: newId(), layer: "macro", raw: stmt.raw, name: "drawfun" });
      break;
    case "macro":
      if (!evalKnownMacro(ctx, stmt.raw)) pushMacro(ctx, stmt.raw, stmt.name);
      break;
  }
}

export function evaluateFigure(program: FigureProgram): Scene {
  const ctx: EvalCtx = {
    shapes: [],
    journal: [],
    pointVars: new Map(),
    numericVars: new Map(),
    pointAssignLines: new Map(),
  };
  for (const stmt of program.stmts) {
    evalStmt(ctx, stmt);
  }
  return {
    shapes: ctx.shapes,
    journal: ctx.journal,
    parsedLines: program.lineCount,
    stmts: program.stmts,
  };
}
