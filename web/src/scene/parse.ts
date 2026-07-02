import { evaluateFigure } from "./figure-eval";
import { expandStatements, parseFigureProgram } from "./stmt-parse";
import type { MacroShape, Scene, Shape } from "./types";

export { expandStatements } from "./stmt-parse";
export type { FigureProgram, Stmt } from "./stmt-ir";

/** Parse MetaPost figure source → Scene (Stmt IR → eval → journal + editable primitives). */
export function parseFigure(source: string): Scene {
  const program = parseFigureProgram(source);
  return evaluateFigure(program);
}

export function unparsedDrawMacros(source: string): string[] {
  const scene = parseFigure(source);
  return scene.shapes
    .filter((s: Shape): s is MacroShape => s.layer === "macro")
    .filter(
      (s) =>
        /^(?:draw|filldraw)\s/i.test(s.raw.trim()) &&
        !/^drawdot|^drawfun|^draw\s+btex/i.test(s.raw.trim()),
    )
    .map((s) => s.raw);
}

export function parseCoverage(source: string): { parsed: number; total: number } {
  const scene = parseFigure(source);
  const total = expandStatements(source).length;
  return { parsed: scene.parsedLines ?? total, total };
}
