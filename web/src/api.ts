const API = "/api";

export type HealthResponse = {
  ok: boolean;
  mpost: string | null;
  latex?: string | null;
  tex_bin?: string | null;
  tex_source?: string;
  tex_hint?: string;
  platform?: string;
  default_mpostdef: string | null;
  default_mposttex: string | null;
};

export type TexToolchainResponse = {
  ok: boolean;
  tex_bin: string | null;
  mpost: string | null;
  latex: string | null;
  source: string;
  platform: string;
  manual_tex_bin: string | null;
  candidates: string[];
  hint: string;
};

export type CompileDiagnostic = {
  line: number;
  column: number | null;
  message: string;
  severity: "error" | "warning";
};

export type CompileResponse = {
  ok: boolean;
  svg: string | null;
  log: string;
  mp_source: string;
  diagnostics?: CompileDiagnostic[];
};

export type ExportResponse = {
  filename: string;
  content: string;
  figure_snippet?: string;
};

export type LoadTexResponse = {
  path: string;
  raw: string;
  mpostdef: string;
  mposttex: string;
};

export type DefaultsResponse = {
  mpostdef: string;
  mposttex: string;
};

export type MacroToolDto = {
  name: string;
  kind: "def" | "vardef";
  description?: string;
  params: { name: string; kind: string; description?: string }[];
  defaults: Record<string, string>;
};

export type PluginInfo = {
  id: string;
  title: string;
  description?: string;
  version?: string;
  author?: string;
  file?: string;
  source?: string;
  tool_name?: string;
  tool_description?: string;
  param_docs?: Record<string, string>;
};

export type DiscoverMacrosResponse = {
  tools: MacroToolDto[];
  plugins?: PluginInfo[];
  plugin_source?: string;
  source_normalized: string;
  source_expanded: string;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error("无法连接本地 mpost 服务");
  return res.json() as Promise<HealthResponse>;
}

export async function fetchTexToolchain(): Promise<TexToolchainResponse> {
  const res = await fetch(`${API}/tex-toolchain`);
  if (!res.ok) throw new Error("无法获取 TeX 路径信息");
  return res.json() as Promise<TexToolchainResponse>;
}

export async function setTexBin(texBin: string): Promise<TexToolchainResponse> {
  const res = await fetch(`${API}/tex-toolchain`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tex_bin: texBin }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || "无法保存 TeX 路径");
  }
  return res.json() as Promise<TexToolchainResponse>;
}

export async function fetchDefaults(): Promise<DefaultsResponse> {
  const res = await fetch(`${API}/defaults`);
  if (!res.ok) throw new Error("无法加载默认宏套件");
  return res.json() as Promise<DefaultsResponse>;
}

export async function compileFigure(body: {
  figure: string;
  mpostdef: string;
  mposttex: string;
  fig_num?: number;
  plugin_paths?: string[];
  search_paths?: string[];
}): Promise<CompileResponse> {
  return postJson<CompileResponse>("/compile", body);
}

export async function exportMp(body: {
  figure: string;
  mpostdef: string;
  mposttex: string;
  fig_num?: number;
  plugin_paths?: string[];
  search_paths?: string[];
}): Promise<ExportResponse> {
  return postJson<ExportResponse>("/export/mp", body);
}

export async function exportMpostinl(body: {
  figure: string;
  label?: string;
  mpostdef?: string;
  mposttex?: string;
  mpostdef_path?: string;
  mposttex_path?: string;
  show?: boolean;
  mpostinl_options?: string;
  plugin_paths?: string[];
  search_paths?: string[];
}): Promise<ExportResponse> {
  return postJson<ExportResponse>("/export/mpostinl", body);
}

export async function loadTexFile(path: string): Promise<LoadTexResponse> {
  return postJson<LoadTexResponse>("/load-tex", { path });
}

export async function discoverMacros(body: {
  mpostdef: string;
  resolve_inputs?: boolean;
  search_paths?: string[];
  plugin_paths?: string[];
}): Promise<DiscoverMacrosResponse> {
  return postJson<DiscoverMacrosResponse>("/macros", {
    resolve_inputs: true,
    search_paths: [],
    plugin_paths: [],
    ...body,
  });
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
