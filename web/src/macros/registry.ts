/** Parse mpostdef for callable macro tools (2b). */

export type MacroParamKind = "expr" | "text" | "suffix" | "primary";

export type MacroParam = {
  name: string;
  kind: MacroParamKind;
  description?: string;
};

export type MacroTool = {
  name: string;
  kind: "def" | "vardef";
  description?: string;
  params: MacroParam[];
  defaults: Record<string, string>;
};

const MPOSTDEF_ENV_RE =
  /\\begin\{mpostdef\}(?:\[[^\]]*\])?\s*([\s\S]*?)\\end\{mpostdef\}/g;

const MACRO_RE =
  /(?:^|\n)\s*(def|vardef)\s+([a-zA-Z_]\w*)\s*(?:\(([^)]*)\))?(?:\(([^)]*)\))?/g;

/** Strip mpostinl wrapper and MetaPost `%` line comments before scanning. */
export function normalizeMpostdefSource(source: string): string {
  let text = source.trim();
  if (text.includes("\\begin{mpostdef}")) {
    const blocks: string[] = [];
    let m: RegExpExecArray | null;
    MPOSTDEF_ENV_RE.lastIndex = 0;
    while ((m = MPOSTDEF_ENV_RE.exec(text)) !== null) {
      blocks.push(m[1].trim());
    }
    if (blocks.length > 0) text = blocks.join("\n\n");
  }
  return text
    .split("\n")
    .map((line) => (line.includes("%") ? line.split("%", 1)[0] : line))
    .join("\n");
}

function parseParams(sig: string): MacroParam[] {
  if (!sig.trim()) return [];
  const params: MacroParam[] = [];
  const parts = sig.split(",").map((s) => s.trim());
  for (const part of parts) {
    const m = part.match(/^(expr|text|suffix|primary)\s+(.+)$/);
    if (m) {
      params.push({ kind: m[1] as MacroParamKind, name: m[2].trim() });
    } else if (part) {
      params.push({ kind: "expr", name: part });
    }
  }
  return params;
}

/** Client-side scan (no `input` resolution). Prefer `discoverMacros` API when server is up. */
export function parseMacroTools(mpostdef: string): MacroTool[] {
  const source = normalizeMpostdefSource(mpostdef);
  const tools: MacroTool[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  MACRO_RE.lastIndex = 0;
  while ((m = MACRO_RE.exec(source)) !== null) {
    const kind = m[1] as "def" | "vardef";
    const name = m[2];
    if (seen.has(name)) continue;
    seen.add(name);
    let params = parseParams(m[3] ?? "");
    if (m[4]) {
      if (name === "drawfun") {
        params = [...params, { kind: "text", name: "f" }];
      } else {
        params = [...params, ...parseParams(m[4])];
      }
    }
    tools.push({
      name,
      kind,
      params,
      defaults: {},
    });
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildMacroCall(tool: MacroTool, args: Record<string, string>): string {
  if (tool.params.length === 0) {
    return `${tool.name};`;
  }
  if (tool.name === "drawfun" && tool.params.some((p) => p.name === "f")) {
    const xmin = args.xmin ?? tool.defaults.xmin ?? "0";
    const xmax = args.xmax ?? tool.defaults.xmax ?? "1";
    const xinc = args.xinc ?? tool.defaults.xinc ?? "0.1";
    const f = args.f ?? tool.defaults.f ?? "x";
    return `drawfun(${xmin}, ${xmax}, ${xinc})(${f});`;
  }
  const groups: string[][] = [];
  let exprGroup: string[] = [];
  for (const p of tool.params) {
    const val = args[p.name] ?? tool.defaults[p.name] ?? "0";
    if (p.kind === "text") {
      if (exprGroup.length > 0) {
        groups.push(exprGroup);
        exprGroup = [];
      }
      groups.push([val]);
    } else {
      exprGroup.push(val);
    }
  }
  if (exprGroup.length > 0) groups.push(exprGroup);
  const sig = groups.map((g) => g.join(", ")).join(")(");
  return `${tool.name}(${sig});`;
}

export function hasMacroDefinitions(mpostdef: string): boolean {
  return parseMacroTools(mpostdef).length > 0;
}
