/** Logical coordinates (MetaPost units before `scaled u`). */
export type LPoint = { x: number; y: number };

/** Node on a MetaPost `..` path; optional `dir` is exit angle in degrees (`{dir θ}`). */
export type MPathNode = { p: LPoint; dir?: number };

export type PrimitiveKind =
  | "dot"
  | "point"
  | "segment"
  | "polyline"
  | "mpath"
  | "bezier"
  | "circle"
  | "circle3"
  | "ellipse"
  | "rect"
  | "arrow";

/** Optional draw modifiers (appended when emitting MetaPost). */
export type ShapeStyle = {
  withpen?: string;
  /** Dash pattern, e.g. evenly or evenly scaled .5 */
  dashed?: string;
  /** Full label statement, e.g. label.top(btex $x$ etex, (3u,2u)) */
  label?: string;
  fill?: boolean;
};

/** Shape handle id -> source point variable, e.g. `{ b: "B" }`. */
export type PointRefs = Record<string, string>;

type Styled = {
  style?: ShapeStyle;
  /** Whether this primitive's original path was followed by `scaled u`. */
  sourceScaled?: boolean;
  /** Editable handle bindings back to source point variables. */
  pointRefs?: PointRefs;
  /** Original point assignment source by variable name, used when rewriting refs. */
  pointRefAssigns?: Record<string, string>;
  /** Drawn on canvas as a macro preview, but omitted when emitting source. */
  previewOnly?: boolean;
  /** Original macro call that produced this preview primitive. */
  sourceMacro?: string;
};

export type PrimitiveShape =
  | ({
      id: string;
      layer: "primitive";
      kind: "dot";
      p: LPoint;
      /** e.g. z[0]=point 0 of pat[0] — emitted before dotlabel */
      pointAssign?: string;
      /** full dotlabel.* statement for round-trip */
      dotlabel?: string;
    } & Styled)
  | ({ id: string; layer: "primitive"; kind: "point"; p: LPoint } & Styled)
  | ({ id: string; layer: "primitive"; kind: "segment"; a: LPoint; b: LPoint } & Styled)
  | ({
      id: string;
      layer: "primitive";
      kind: "polyline";
      pts: LPoint[];
      /** `draw …--cycle` straight-line closure (not `..cycle` spline). */
      closed?: boolean;
      /** MetaPost path variable, e.g. p */
      pathVar?: string;
    } & Styled)
  | ({
      id: string;
      layer: "primitive";
      kind: "mpath";
      nodes: MPathNode[];
      closed?: boolean;
      /** MetaPost path variable, e.g. pat[0] */
      pathVar?: string;
    } & Styled)
  | ({
      id: string;
      layer: "primitive";
      kind: "bezier";
      a: LPoint;
      b: LPoint;
      c: LPoint;
      d: LPoint;
    } & Styled)
  | ({
      id: string;
      layer: "primitive";
      kind: "circle";
      center: LPoint;
      r: number;
      /** MetaPost path variable, e.g. pat[1] */
      pathVar?: string;
      /** RHS after `=`, e.g. fullcircle scaled 1u shifted z[1] */
      pathAssign?: string;
      circleBuiltin?: "fullcircle" | "halfcircle";
    } & Styled)
  | ({
      id: string;
      layer: "primitive";
      kind: "circle3";
      a: LPoint;
      b: LPoint;
      c: LPoint;
    } & Styled)
  | ({
      id: string;
      layer: "primitive";
      kind: "ellipse";
      center: LPoint;
      rx: number;
      ry: number;
    } & Styled)
  | ({ id: string; layer: "primitive"; kind: "rect"; a: LPoint; b: LPoint } & Styled)
  | ({ id: string; layer: "primitive"; kind: "arrow"; a: LPoint; b: LPoint } & Styled);

/** Resolved geometry from eval (independent of MetaPost surface syntax). */
export type GeomEntry =
  | { kind: "segment"; a: LPoint; b: LPoint; style?: ShapeStyle }
  | { kind: "polyline"; pts: LPoint[]; closed?: boolean; style?: ShapeStyle }
  | { kind: "dot"; p: LPoint; style?: ShapeStyle };

/** Macro call preserved as opaque source (2b). */
export type MacroShape = {
  id: string;
  layer: "macro";
  raw: string;
  name: string;
};

export type Shape = PrimitiveShape | MacroShape;

import type { Stmt } from "./stmt-ir";

export type Scene = {
  shapes: Shape[];
  /** Resolved geometry from eval pass (bounds + future overlay). */
  journal?: GeomEntry[];
  /** Parsed statement IR (Phase 1). */
  stmts?: Stmt[];
  /** Set by parseFigure: non-comment source lines handled this pass. */
  parsedLines?: number;
};

export function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyScene(): Scene {
  return { shapes: [] };
}
