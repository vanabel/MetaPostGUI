import { splitModifiers } from "./modifiers";
import type { ShapeStyle } from "./types";
import type { AssignOp, DrawOp, FigureProgram, Stmt } from "./stmt-ir";

export function expandStatements(source: string): string[] {
  const out: string[] = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%")) continue;
    if (/^(withpen|dashed|withcolor)\b/i.test(line) && out.length > 0) {
      const prev = out.pop()!.replace(/;\s*$/, "");
      out.push(`${prev} ${line.replace(/;\s*$/, "")};`);
      continue;
    }
    const parts = line.split(";").map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) {
      out.push(line.endsWith(";") ? line : `${line};`);
      continue;
    }
    for (const part of parts) {
      if (part) out.push(`${part};`);
    }
  }
  return out;
}

function macroName(raw: string): string {
  const t = raw.trim();
  let m = t.match(/^dotlabel(?:\.(\w+))?/i);
  if (m) return "dotlabel";
  m = t.match(/^label\.(\w+)/i);
  if (m) return "label";
  m = t.match(/^([a-zA-Z_]\w*)\s*\(/);
  if (m) return m[1];
  m = t.match(/^([a-zA-Z_]\w*)\s*\[/);
  if (m) return m[1];
  m = t.match(/^([a-zA-Z_]\w*)\s*:=/);
  if (m) return m[1];
  m = t.match(/^([a-zA-Z_]\w*)\s*=/);
  if (m) return m[1];
  m = t.match(/^(input|color|draw|filldraw|hatchfill|path|drawarrow|drawdot)\b/i);
  if (m) return m[1].toLowerCase();
  return "macro";
}

function parseDrawOptions(line: string): Stmt | null {
  const m = line.replace(/;\s*$/, "").match(/^drawoptions\s*\(\s*(.+?)\s*\)\s*$/i);
  if (!m) return null;
  return { kind: "drawOptions", raw: line.replace(/;\s*$/, ""), body: m[1].trim() };
}

function parseDecl(line: string): Stmt | null {
  const t = line.replace(/;\s*$/, "");
  const m = t.match(/^(pair|numeric|path)\s+([a-zA-Z_]\w*(?:\[\])?(?:\s*,\s*[a-zA-Z_]\w*(?:\[\])?)*)\s*$/i);
  if (!m) return null;
  return {
    kind: "decl",
    raw: t,
    declKind: m[1].toLowerCase() as "pair" | "numeric" | "path",
    name: m[2],
  };
}

function parseAssign(line: string): Stmt | null {
  const t = line.replace(/;\s*$/, "");
  const colon = t.match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*:=\s*(.+)$/);
  if (colon) {
    return { kind: "assign", raw: t, lhs: colon[1], op: ":=" as AssignOp, rhs: colon[2].trim() };
  }
  const plain = t.match(/^([a-zA-Z_]\w*(?:\[\d+\])?)\s*=\s*(.+)$/);
  if (plain) {
    return { kind: "assign", raw: t, lhs: plain[1], op: "=" as AssignOp, rhs: plain[2].trim() };
  }
  return null;
}

function parseDotlabel(line: string): Stmt | null {
  const m = line
    .replace(/;\s*$/, "")
    .match(/^dotlabel(?:\.(\w+))?\s*\(\s*(btex[\s\S]*?etex)\s*,\s*(.+)\)$/i);
  if (!m) return null;
  return {
    kind: "dotlabel",
    raw: line.replace(/;\s*$/, ""),
    position: m[1] ?? "",
    labelText: m[2],
    positionArg: m[3].trim(),
  };
}

function parseDrawfun(line: string): Stmt | null {
  const m = line.match(/^drawfun\s*\(([^)]*)\)\s*\(([^)]*)\)\s*;?$/i);
  if (!m) return null;
  return {
    kind: "drawfun",
    raw: `drawfun(${m[1]})(${m[2]})`,
    args1: m[1],
    args2: m[2],
  };
}

function parseDraw(line: string, stackStyle: ShapeStyle): Stmt | null {
  const { core, style } = splitModifiers(line);
  const merged: ShapeStyle = { ...stackStyle, ...style };
  const dm = core.match(/^(filldraw|drawarrow|drawdot|draw)\b\s*(.+)$/i);
  if (!dm) return null;
  const op = dm[1].toLowerCase() as DrawOp;
  return {
    kind: "draw",
    raw: line.replace(/;\s*$/, ""),
    op,
    pathExpr: dm[2].trim(),
    style: merged,
  };
}

function isKnownMacroLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("%")) return false;
  if (/^(draw|filldraw|drawarrow|drawdot)\b/i.test(t)) return false;
  if (/^label\./i.test(t)) return false;
  if (/^dotlabel(?:\.|\s*\()/i.test(t)) return false;
  if (/^(input|color|hatchfill|path)\b/i.test(t)) return true;
  if (/^[a-zA-Z_]\w*\s*:=/.test(t)) return true;
  if (/^[a-zA-Z_]\w*\s*=\s*/.test(t)) return true;
  return /^[a-zA-Z_]\w*\s*\(/.test(t) || /^[a-zA-Z_]\w*\s*;/.test(t);
}

/** Classify one MetaPost statement line into Stmt IR. */
export function parseStmtLine(line: string, drawStack: ShapeStyle): Stmt {
  const trimmed = line.trim();
  const raw = trimmed.replace(/;\s*$/, "");

  const drawOpt = parseDrawOptions(trimmed);
  if (drawOpt) return drawOpt;

  const decl = parseDecl(trimmed);
  if (decl) return decl;

  if (/^label\./i.test(trimmed)) {
    return { kind: "label", raw, body: trimmed };
  }

  const dotlabel = parseDotlabel(trimmed);
  if (dotlabel) return dotlabel;

  const drawfun = parseDrawfun(trimmed);
  if (drawfun) return drawfun;

  const assign = parseAssign(trimmed);
  if (assign) return assign;

  const draw = parseDraw(trimmed, drawStack);
  if (draw) return draw;

  if (isKnownMacroLine(trimmed)) {
    return { kind: "macro", raw, name: macroName(trimmed) };
  }

  if (/^(?:draw|filldraw|drawarrow|drawdot)\b/i.test(trimmed)) {
    return { kind: "macro", raw, name: macroName(trimmed) };
  }

  if (/^dotlabel(?:\.|\s*\()/i.test(trimmed)) {
    return { kind: "macro", raw, name: "dotlabel" };
  }

  return { kind: "macro", raw, name: macroName(trimmed) };
}

export function parseFigureProgram(source: string): FigureProgram {
  const lines = expandStatements(source);
  const drawStack: ShapeStyle = {};
  const stmts: Stmt[] = [];

  for (const line of lines) {
    const stmt = parseStmtLine(line, drawStack);
    if (stmt.kind === "drawOptions") {
      const dashed = stmt.body.match(/\bdashed\s+(\S+(?:\s+\S+)*)/i);
      if (dashed) drawStack.dashed = dashed[1].trim();
      const pen = stmt.body.match(/\bwithpen\s+(.+)$/i);
      if (pen) drawStack.withpen = pen[1].trim();
    }
    stmts.push(stmt);
  }

  return { stmts, lineCount: lines.length };
}
