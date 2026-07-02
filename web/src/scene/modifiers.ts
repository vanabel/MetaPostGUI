import type { ShapeStyle } from "./types";

const WITHPEN_RE = /\s+withpen\s+([^;]+?)(?=\s*;?\s*$)/i;
const WITHCOLOR_RE = /\s+withcolor\s+([^;]+?)(?=\s*;?\s*$)/i;
const DASHED_RE = /\s+dashed\s+([^;]+?)(?=\s*;?\s*$)/i;

const DEFAULT_DASHED_PEN = "pencircle scaled 1pt";

function ensurePenScaled(withpen: string): string {
  const t = withpen.trim();
  if (!t) return DEFAULT_DASHED_PEN;
  if (t.toLowerCase() === "pencircle") return DEFAULT_DASHED_PEN;
  if (!/\bscaled\b/i.test(t) && /^pencircle\b/i.test(t)) {
    return `${t} scaled 1pt`;
  }
  return t;
}

function splitDashedFromWithpen(withpen: string): { withpen?: string; dashed?: string } {
  const m = withpen.match(/^(.*?)\s+dashed\s+(.+)$/i);
  if (!m) return { withpen: withpen.trim() };
  const pen = m[1].trim();
  const dash = m[2].trim() || "evenly";
  return {
    withpen: pen || undefined,
    dashed: dash,
  };
}

/** Move mistaken `withpen dashed …` / `withpen pencircle dashed …` into separate modifiers. */
export function normalizeShapeStyle(style?: ShapeStyle): ShapeStyle | undefined {
  if (!style) return style;
  const next: ShapeStyle = { ...style };

  if (next.withpen?.match(/^dashed\b/i)) {
    const rest = next.withpen.replace(/^dashed\s*/i, "").trim();
    next.dashed = next.dashed ?? (rest || "evenly");
    delete next.withpen;
  } else if (next.withpen && /\s+dashed\s+/i.test(next.withpen)) {
    const split = splitDashedFromWithpen(next.withpen);
    if (split.withpen) next.withpen = split.withpen;
    else delete next.withpen;
    if (split.dashed) next.dashed = next.dashed ?? split.dashed;
  }

  if (next.dashed && !next.withpen) {
    next.withpen = DEFAULT_DASHED_PEN;
  } else if (next.dashed && next.withpen) {
    next.withpen = ensurePenScaled(next.withpen);
  }

  return next;
}

export function splitModifiers(line: string): { core: string; style: ShapeStyle } {
  const style: ShapeStyle = {};
  let core = line.trim().replace(/;\s*$/, "");

  const dashed = core.match(DASHED_RE);
  if (dashed) {
    style.dashed = dashed[1].trim();
    core = core.replace(DASHED_RE, "");
  }

  const pen = core.match(WITHPEN_RE);
  if (pen) {
    style.withpen = pen[1].trim();
    core = core.replace(WITHPEN_RE, "");
  }

  const color = core.match(WITHCOLOR_RE);
  if (color) {
    style.withpen = style.withpen
      ? `${style.withpen} withcolor ${color[1].trim()}`
      : `withcolor ${color[1].trim()}`;
    core = core.replace(WITHCOLOR_RE, "");
  }

  if (/^filldraw\b/i.test(core)) {
    style.fill = true;
  }

  return { core: core.trim(), style: normalizeShapeStyle(style) ?? style };
}

export function appendModifiers(base: string, style?: ShapeStyle): string[] {
  const lines: string[] = [];
  let line = base.replace(/;\s*$/, "");
  const s = normalizeShapeStyle(style);
  if (s?.withpen) {
    line += ` withpen ${s.withpen}`;
  }
  if (s?.dashed) {
    line += ` dashed ${s.dashed}`;
  }
  lines.push(line + ";");
  if (s?.label?.trim()) {
    const lab = s.label.trim().replace(/;\s*$/, "");
    lines.push(lab.endsWith(";") ? lab : lab + ";");
  }
  return lines;
}

/** Re-parse draw modifiers on a raw MetaPost line (for macro stubs / code sync). */
export function repairMpDrawLine(line: string): string {
  const t = line.trim();
  if (!/^(?:draw|filldraw|drawarrow|drawdot)\b/i.test(t)) {
    return t.endsWith(";") ? t : `${t};`;
  }
  const { core, style } = splitModifiers(t);
  if (!style.withpen && !style.dashed && !style.label && !style.fill) {
    return t.endsWith(";") ? t : `${t};`;
  }
  return appendModifiers(core, style)[0] ?? t;
}

export function drawOp(
  kind: string,
  style?: ShapeStyle,
): "draw" | "filldraw" | "drawarrow" {
  if (kind === "arrow") return "drawarrow";
  if (style?.fill) return "filldraw";
  if (kind === "point") return "filldraw";
  return "draw";
}
