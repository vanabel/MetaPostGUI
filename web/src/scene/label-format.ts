import type { LPoint } from "./types";

export type MpLabelStatement = {
  kind: "label" | "dotlabel";
  placement: string;
  tex: string;
  text: string;
  pointArg: string;
};

export type LabelPlacement = {
  dx: number;
  dy: number;
  textAnchor: "start" | "middle" | "end";
};

const TEX_COMMANDS: Record<string, string> = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  theta: "theta",
  phi: "phi",
  varphi: "phi",
  pi: "pi",
  cdot: "*",
  times: "x",
};

export function labelTextFromTex(tex: string): string {
  let text = tex.trim();
  text = text.replace(/^btex\s*/i, "").replace(/\s*etex$/i, "").trim();
  text = text.replace(/^\$(.*)\$$/s, "$1").trim();
  text = text.replace(/\\(?:mathrm|text)\{([^}]*)\}/g, "$1");
  text = text.replace(/\\([A-Za-z]+)/g, (_m, name: string) => TEX_COMMANDS[name] ?? name);
  text = text.replace(/[{}]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

export function parseMpLabelStatement(raw: string): MpLabelStatement | null {
  const m = raw
    .trim()
    .replace(/;\s*$/, "")
    .match(/^(dotlabel|label)(?:\.(\w+))?\s*\(\s*(btex[\s\S]*?etex)\s*,\s*(.+)\)$/i);
  if (!m) return null;
  const tex = m[3].trim();
  return {
    kind: m[1].toLowerCase() as "label" | "dotlabel",
    placement: (m[2] ?? "urt").toLowerCase(),
    tex,
    text: labelTextFromTex(tex),
    pointArg: m[4].trim(),
  };
}

export function labelPlacementOffset(
  placement: string,
  distance = 0.34,
): LabelPlacement {
  const p = placement.toLowerCase();
  let dx = 0;
  let dy = 0;
  if (p.includes("lft")) dx = -distance;
  else if (p.includes("rt")) dx = distance;
  if (p.includes("top") || p.includes("urt") || p.includes("ulft")) dy = distance;
  else if (p.includes("bot") || p.includes("lrt") || p.includes("llft")) dy = -distance;

  return {
    dx,
    dy,
    textAnchor: dx < 0 ? "end" : dx > 0 ? "start" : "middle",
  };
}

export function addOffset(p: LPoint, offset: Pick<LabelPlacement, "dx" | "dy">): LPoint {
  return { x: p.x + offset.dx, y: p.y + offset.dy };
}
