import type { ShapeStyle } from "./types";

export type DrawOp = "draw" | "filldraw" | "drawarrow" | "drawdot";

export type AssignOp = ":=" | "=";

/** Statement IR — surface-syntax independent. */
export type Stmt =
  | { kind: "drawOptions"; raw: string; body: string }
  | { kind: "decl"; raw: string; declKind: "pair" | "numeric" | "path"; name: string }
  | { kind: "assign"; raw: string; lhs: string; op: AssignOp; rhs: string }
  | { kind: "draw"; raw: string; op: DrawOp; pathExpr: string; style: ShapeStyle }
  | { kind: "dotlabel"; raw: string; position: string; positionArg: string; labelText: string }
  | { kind: "label"; raw: string; body: string }
  | { kind: "drawfun"; raw: string; args1: string; args2: string }
  | { kind: "macro"; raw: string; name: string };

export type FigureProgram = {
  stmts: Stmt[];
  /** Non-comment source lines (after `;` split). */
  lineCount: number;
};
