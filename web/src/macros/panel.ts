import { discoverMacros, type PluginInfo } from "../api";
import { createCollapsibleSection } from "../ui/collapsible-section";
import { showMacroDialog } from "./dialog";
import { showPluginSourceDialog } from "./plugin-preview";
import {
  buildMacroCall,
  hasMacroDefinitions,
  parseMacroTools,
  type MacroTool,
} from "./registry";
import type { Scene } from "../scene/types";
import { newId } from "../scene/types";

function mapToolDto(t: {
  name: string;
  kind: "def" | "vardef";
  description?: string;
  params: { name: string; kind: string; description?: string }[];
  defaults?: Record<string, string>;
}): MacroTool {
  return {
    name: t.name,
    kind: t.kind,
    description: t.description,
    params: t.params.map((p) => ({
      name: p.name,
      kind: p.kind as MacroTool["params"][0]["kind"],
      description: p.description,
    })),
    defaults: t.defaults ?? {},
  };
}

function toolTooltip(tool: MacroTool): string {
  const lines: string[] = [];
  if (tool.description) lines.push(tool.description);
  for (const p of tool.params) {
    lines.push(p.description ? `${p.name} — ${p.description}` : `${p.kind} ${p.name}`);
  }
  return lines.join("\n");
}

export type MacroPanelOptions = {
  getMpostdef: () => string;
  getSearchPaths: () => string[];
  getPluginPaths: () => string[];
  onInsert: (scene: Scene) => void;
  getScene: () => Scene;
};

export function createMacroPanel(
  parent: HTMLElement,
  opts: MacroPanelOptions,
): { refresh: () => Promise<void> } {
  const wrap = document.createElement("div");
  wrap.className = "macro-panel";
  wrap.innerHTML = `<div class="macro-panel-title">宏工具 <span class="macro-panel-hint">（2b · mpostdef + 插件）</span></div>`;
  const status = document.createElement("div");
  status.className = "macro-panel-status";
  const macroSection = createCollapsibleSection("宏");
  const pluginSection = createCollapsibleSection("插件");
  wrap.append(status, macroSection.root, pluginSection.root);
  parent.appendChild(wrap);

  async function resolveTools(): Promise<MacroTool[]> {
    const mpostdef = opts.getMpostdef();
    try {
      const res = await discoverMacros({
        mpostdef,
        resolve_inputs: true,
        search_paths: opts.getSearchPaths(),
        plugin_paths: opts.getPluginPaths(),
      });
      return res.tools.map(mapToolDto);
    } catch {
      return parseMacroTools(mpostdef);
    }
  }

  async function insertTool(tool: MacroTool): Promise<void> {
    const args = await showMacroDialog(tool);
    if (args === null) return;
    const raw = buildMacroCall(tool, args);
    const scene = opts.getScene();
    scene.shapes.push({
      id: newId(),
      layer: "macro",
      raw: raw.replace(/;?\s*$/, ""),
      name: tool.name,
    });
    opts.onInsert(scene);
  }

  function renderPlugins(plugins: PluginInfo[]): void {
    const collapsed = pluginSection.isCollapsed();
    pluginSection.body.replaceChildren();
    pluginSection.setTitle(plugins.length > 0 ? `插件 (${plugins.length})` : "插件");

    if (plugins.length === 0) {
      const empty = document.createElement("p");
      empty.className = "macro-empty";
      empty.textContent = "未加载插件";
      pluginSection.body.appendChild(empty);
      pluginSection.setCollapsed(collapsed);
      return;
    }

    for (const plugin of plugins) {
      const row = document.createElement("div");
      row.className = "plugin-row";

      const info = document.createElement("div");
      info.className = "plugin-row-info";

      const name = document.createElement("span");
      name.className = "plugin-row-name";
      name.textContent = plugin.title || plugin.id;
      name.title = plugin.file ?? plugin.id;

      const id = document.createElement("span");
      id.className = "plugin-row-id";
      id.textContent = plugin.id;

      info.append(name, id);
      if (plugin.description) {
        const desc = document.createElement("span");
        desc.className = "plugin-row-desc";
        desc.textContent = plugin.description;
        info.appendChild(desc);
      }

      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "ghost plugin-view-btn";
      viewBtn.textContent = "源码";
      viewBtn.title = "查看插件 MetaPost 宏定义";
      viewBtn.addEventListener("click", () => showPluginSourceDialog(plugin));

      row.append(info, viewBtn);
      pluginSection.body.appendChild(row);
    }
    pluginSection.setCollapsed(collapsed);
  }

  function renderTools(tools: MacroTool[], pluginCount = 0, plugins: PluginInfo[] = []): void {
    const macrosCollapsed = macroSection.isCollapsed();
    macroSection.body.replaceChildren();
    renderPlugins(plugins);

    if (tools.length === 0) {
      status.textContent =
        pluginCount > 0 ? `已加载 ${pluginCount} 个插件，无匹配宏` : "未找到可用宏";
      macroSection.setTitle("宏");
      if (pluginCount === 0) {
        const empty = document.createElement("p");
        empty.className = "macro-empty";
        const src = opts.getMpostdef().trim();
        if (!src) {
          empty.textContent =
            "mpostdef 为空：请打开 mpostdef 标签页，或从路径加载宏文件。";
        } else if (!hasMacroDefinitions(src)) {
          empty.innerHTML =
            "未找到 <code>def</code>/<code>vardef</code>。若仅有 <code>input snippets/all</code>，请确认本地服务已启动以展开 input；或将宏定义粘贴到 mpostdef 中。详见 <code>docs/EXTENDING.md</code>。";
        } else {
          empty.textContent = "解析失败，请检查 mpostdef 语法。";
        }
        macroSection.body.appendChild(empty);
      } else {
        const empty = document.createElement("p");
        empty.className = "macro-empty";
        empty.textContent = "无匹配宏";
        macroSection.body.appendChild(empty);
      }
      macroSection.setCollapsed(macrosCollapsed);
      return;
    }

    status.textContent =
      pluginCount > 0
        ? `${tools.length} 个宏 · ${pluginCount} 个插件`
        : `${tools.length} 个宏`;
    macroSection.setTitle(`宏 (${tools.length})`);

    const list = document.createElement("div");
    list.className = "macro-list";
    for (const tool of tools) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "macro-btn";
      btn.title = toolTooltip(tool);
      btn.textContent = tool.name;
      btn.addEventListener("click", () => void insertTool(tool));
      list.appendChild(btn);
    }
    macroSection.body.appendChild(list);
    macroSection.setCollapsed(macrosCollapsed);
  }

  async function refresh(): Promise<void> {
    status.textContent = "扫描宏…";
    const mpostdef = opts.getMpostdef();
    let pluginCount = 0;
    let plugins: PluginInfo[] = [];
    try {
      const res = await discoverMacros({
        mpostdef,
        resolve_inputs: true,
        search_paths: opts.getSearchPaths(),
        plugin_paths: opts.getPluginPaths(),
      });
      pluginCount = res.plugins?.length ?? 0;
      plugins = res.plugins ?? [];
      const tools = res.tools.map(mapToolDto);
      renderTools(tools, pluginCount, plugins);
      return;
    } catch {
      /* fall through */
    }
    const tools = await resolveTools();
    renderTools(tools, pluginCount, plugins);
  }

  void refresh();
  return { refresh };
}
