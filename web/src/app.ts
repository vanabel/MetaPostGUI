import "./style.css";
import { EditorView } from "@codemirror/view";
import type { HealthResponse } from "./api";
import {
  compileFigure,
  discoverMacros,
  downloadText,
  exportMp,
  exportMpostinl,
  fetchDefaults,
  fetchTexToolchain,
  setTexBin,
} from "./api";
import { CanvasEditor } from "./canvas/editor";
import {
  loadImageSize,
  loadPersistedSketch,
  persistSketch,
  type SketchBackground,
  type SketchInput,
} from "./canvas/sketch";
import { createPropertiesPanel } from "./canvas/properties";
import { buildToolRail } from "./canvas/tool-rail";
import { TOOL_HINTS, type DrawTool } from "./canvas/tools";
import type { ExportResponse } from "./api";
import { setSidebarToggleIcon } from "./icons/sidebar-toggle";
import { bindScrollableHint } from "./ui/scrollable-hint";
import { renderTexToolchainStatus } from "./tex-toolchain-ui";
import { createEditor, createReadonlyEditor, clearEditorLineHighlights, getEditorValue, scrollEditorToLine, setEditorLineHighlights, setEditorValue } from "./editor";
import { clearCompileDiagnostics, compileDiagnosticsExtension, setCompileDiagnostics } from "./compile-lint";
import { createExamplesPanel } from "./examples/panel";
import type { ExampleEntry } from "./examples/types";
import { createMacroPanel } from "./macros/panel";
import { hasMacroDefinitions } from "./macros/registry";
import { emitScene } from "./scene/emit";
import { SceneHistory } from "./scene/history";
import { findRelatedLineNumbers } from "./scene/shape-code-lines";
import { createSyncBridge, debounce } from "./scene/sync";
import type { Scene } from "./scene/types";

const DEFAULT_FIGURE = `drawgrid(5);
draw ((0,0)--(3,2)) scaled u withpen pencircle scaled 1.5pt;
drawarrow ((0,0)--(3u,2u));`;

type TabId = "figure" | "mpostdef" | "mposttex";
type PreviewTabId = "graphic" | "mp" | "mpostinl" | "plugins";

const STORAGE_KEY = "metapostgui-state-v2";

type SavedState = {
  figure: string;
  mpostdef: string;
  mposttex: string;
  mpostdefPath: string;
  mposttexPath: string;
  exportLabel: string;
  snapEnabled: boolean;
  snippetSearchPath: string;
  pluginSearchPath: string;
  autoPreview: boolean;
  sidebarHidden?: boolean;
};

function loadState(): Partial<SavedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<SavedState>) : {};
  } catch {
    return {};
  }
}

function saveState(state: SavedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function projectSection(title: string): HTMLElement {
  const section = el("section", "project-section");
  const heading = document.createElement("h3");
  heading.className = "project-section-title";
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function projectField(label: string, control: HTMLElement): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "project-field";
  wrap.append(el("span", "project-field-label", label), control);
  return wrap;
}

function markProjectInput(input: HTMLInputElement): HTMLInputElement {
  input.classList.add("project-input");
  return input;
}

function projectHint(text: string): HTMLParagraphElement {
  return el("p", "project-field-hint", text);
}

export async function bootstrap(): Promise<void> {
  const saved = loadState();
  const app = document.getElementById("app");
  if (!app) return;

  let compiling = false;
  let snapEnabled = saved.snapEnabled ?? true;
  let autoPreview = saved.autoPreview ?? true;
  let sidebarHidden = saved.sidebarHidden ?? false;
  let currentTool: DrawTool = "select";

  const statusEl = el("span", "status-pill", "正在连接服务…");
  const syncHintEl = el("span", "sync-hint");
  const logEl = el("div", "log-panel");
  const previewGraphicEl = el("div", "preview-body");
  previewGraphicEl.appendChild(
    el("div", "preview-placeholder", "编译后在此显示 mpost 图形"),
  );
  const toolHintEl = el("span", "tool-hint", TOOL_HINTS.select);
  bindScrollableHint(toolHintEl);

  const editors: Record<TabId, EditorView | null> = {
    figure: null,
    mpostdef: null,
    mposttex: null,
  };

  const editorMount = el("div", "editor-wrap");
  const canvasMount = el("div", "canvas-mount");

  const history = new SceneHistory();
  let propsPanel: { refresh: () => void } = { refresh: () => {} };

  const mpostdefPathInput = markProjectInput(document.createElement("input"));
  mpostdefPathInput.type = "text";
  mpostdefPathInput.value = saved.mpostdefPath ?? "metapost/mpost-def.tex";

  const mposttexPathInput = markProjectInput(document.createElement("input"));
  mposttexPathInput.type = "text";
  mposttexPathInput.value = saved.mposttexPath ?? "metapost/mpost-tex.tex";

  const exportLabelInput = markProjectInput(document.createElement("input"));
  exportLabelInput.type = "text";
  exportLabelInput.value = saved.exportLabel ?? "fig-demo";

  const snippetPathInput = markProjectInput(document.createElement("input"));
  snippetPathInput.type = "text";
  snippetPathInput.placeholder = "留空则自动搜索旁的 MetaPost-Script/snippets";
  snippetPathInput.value = saved.snippetSearchPath ?? "";

  const pluginPathInput = markProjectInput(document.createElement("input"));
  pluginPathInput.type = "text";
  pluginPathInput.placeholder = "可选：自定义插件目录（每文件一个 *.plugin.json）";
  pluginPathInput.value = saved.pluginSearchPath ?? "";

  const texBinInput = markProjectInput(document.createElement("input"));
  texBinInput.type = "text";
  texBinInput.placeholder = "含 mpost 的目录，如 /Library/TeX/texbin";
  texBinInput.spellcheck = false;

  const texBinStatusEl = el("div", "tex-toolchain-status");
  const texBinHintEl = el("p", "tex-toolchain-hint");

  function applyHealthToStatus(health: HealthResponse): void {
    if (health.ok) {
      const latexNote = health.latex ? "" : "（无 latex）";
      statusEl.textContent = `mpost 就绪${latexNote}`;
      statusEl.className = health.latex ? "status-pill ok" : "status-pill warn";
    } else {
      statusEl.textContent = "未找到 mpost";
      statusEl.className = "status-pill err";
    }
    if (health.tex_hint && !health.ok) {
      texBinHintEl.textContent = health.tex_hint;
    } else if (health.tex_hint && health.ok && !health.latex) {
      texBinHintEl.textContent = health.tex_hint;
    }
  }

  async function refreshTexToolchain(): Promise<void> {
    try {
      const tc = await fetchTexToolchain();
      renderTexToolchainStatus(texBinStatusEl, tc);
      if (tc.manual_tex_bin) {
        texBinInput.value = tc.manual_tex_bin;
      } else if (tc.tex_bin && !texBinInput.value.trim()) {
        texBinInput.placeholder = `已自动识别：${tc.tex_bin}`;
      }
      if (tc.hint) texBinHintEl.textContent = tc.hint;
      else if (tc.ok) texBinHintEl.textContent = "";
      applyHealthToStatus({
        ok: tc.ok,
        mpost: tc.mpost,
        latex: tc.latex,
        tex_bin: tc.tex_bin,
        tex_source: tc.source,
        tex_hint: tc.hint,
        platform: tc.platform,
        default_mpostdef: null,
        default_mposttex: null,
      });
    } catch {
      texBinStatusEl.textContent = "无法读取 TeX 路径（服务未启动？）";
    }
  }

  function getPluginPaths(): string[] {
    const p = pluginPathInput.value.trim();
    return p ? [p] : [];
  }

  function getSnippetSearchPaths(): string[] {
    const p = snippetPathInput.value.trim();
    return p ? [p] : [];
  }

  let canvas: CanvasEditor;
  let macroPanel: { refresh: () => Promise<void> };

  function persist(): void {
    saveState({
      figure: getEditorValue(editors.figure!),
      mpostdef: getEditorValue(editors.mpostdef!),
      mposttex: getEditorValue(editors.mposttex!),
      mpostdefPath: mpostdefPathInput.value,
      mposttexPath: mposttexPathInput.value,
      exportLabel: exportLabelInput.value,
      snapEnabled,
      snippetSearchPath: snippetPathInput.value,
      pluginSearchPath: pluginPathInput.value,
      autoPreview,
      sidebarHidden,
    });
  }

  const debouncedAutoCompile = debounce(() => {
    if (!autoPreview) return;
    void runCompile({ auto: true });
  }, 900);

  function scheduleAutoPreview(): void {
    if (!autoPreview) return;
    debouncedAutoCompile();
  }

  const sync = createSyncBridge({
    setFigureCode(code) {
      if (editors.figure) setEditorValue(editors.figure, code);
      syncHintEl.textContent = sync.getParseHint(code);
    },
    getFigureCode() {
      return editors.figure ? getEditorValue(editors.figure) : "";
    },
    setCanvasScene(scene) {
      canvas.setScene(scene);
    },
  });

  const debouncedCodeToCanvas = debounce(() => {
    if (!editors.figure) return;
    const code = getEditorValue(editors.figure);
    // 画布推送的代码与当前场景一致时，不要重新 parse（会换 id 导致选中被清除）
    if (code.trim() === emitScene(canvas.getScene()).trim()) return;
    sync.pushCodeToCanvas(code);
    syncHintEl.textContent = sync.getParseHint(code);
    persist();
    scheduleAutoPreview();
  }, 400);

  function syncSelectionCodeHighlight(): void {
    if (!editors.figure) return;
    const shape = canvas.getSelectedShape();
    if (!shape) {
      clearEditorLineHighlights(editors.figure);
      return;
    }
    const code = getEditorValue(editors.figure);
    const lines = findRelatedLineNumbers(code, shape);
    setEditorLineHighlights(editors.figure, lines);
    if (lines.length > 0) {
      scrollEditorToLine(editors.figure, lines[0]);
    }
  }

  function applyScene(scene: Scene, syncCode = true): void {
    canvas.setScene(scene);
    if (syncCode) {
      sync.pushCanvasToCode(scene);
      syncHintEl.textContent = sync.getParseHint(emitScene(scene));
    }
    propsPanel.refresh();
    syncSelectionCodeHighlight();
    persist();
    scheduleAutoPreview();
  }

  function onSceneFromCanvas(scene: Scene): void {
    applyScene(scene);
  }

  function undo(): void {
    const prev = history.undo(canvas.getScene());
    if (prev) applyScene(prev);
  }

  function redo(): void {
    const next = history.redo(canvas.getScene());
    if (next) applyScene(next);
  }

  canvas = new CanvasEditor(canvasMount, {
    snapStep: 0.25,
    snapEnabled,
    onSceneChange: onSceneFromCanvas,
    onEditStart: (scene) => history.record(scene),
    onSelectionChange: (id) => {
      propsPanel.refresh();
      if (id) {
        setSidebarTab("props");
        setTab("figure");
      }
      syncSelectionCodeHighlight();
    },
    onSketchChange: (sketch) => persistSketch(sketch),
  });

  async function ensureMpostdefReady(): Promise<void> {
    if (!editors.mpostdef) return;
    const current = getEditorValue(editors.mpostdef);
    if (!current.trim()) {
      try {
        const defaults = await fetchDefaults();
        if (defaults.mpostdef) {
          setEditorValue(editors.mpostdef, defaults.mpostdef);
        }
        if (defaults.mposttex && editors.mposttex && !getEditorValue(editors.mposttex).trim()) {
          setEditorValue(editors.mposttex, defaults.mposttex);
        }
      } catch {
        /* ignore */
      }
      await macroPanel.refresh();
      return;
    }
    if (hasMacroDefinitions(current)) {
      await macroPanel.refresh();
      return;
    }
    try {
      const discovered = await discoverMacros({
        mpostdef: current,
        search_paths: getSnippetSearchPaths(),
        plugin_paths: getPluginPaths(),
      });
      if (discovered.tools.length > 0) {
        await macroPanel.refresh();
        return;
      }
    } catch {
      /* server offline — fall through */
    }
    await macroPanel.refresh();
  }

  function mountEditor(tab: TabId): void {
    editorMount.innerHTML = "";
    if (!editors[tab]) {
      const initial =
        tab === "figure"
          ? (saved.figure ?? DEFAULT_FIGURE)
          : tab === "mpostdef"
            ? (saved.mpostdef ?? "")
            : (saved.mposttex ?? "");
      const onChange = () => {
        persist();
        if (tab === "figure") debouncedCodeToCanvas();
        if (tab === "mpostdef") void macroPanel.refresh();
        scheduleAutoPreview();
      };
      const language = tab === "mposttex" ? "latex" : "metapost";
      const extra = tab === "figure" ? [compileDiagnosticsExtension()] : [];
      editors[tab] = createEditor(editorMount, initial, onChange, language, extra);
    } else {
      editorMount.appendChild(editors[tab]!.dom);
    }
  }

  function setTab(tab: TabId): void {
    document.querySelectorAll(".code-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    mountEditor(tab);
  }

  let logDrawerEl!: HTMLElement;

  async function runCompile(options?: { auto?: boolean }): Promise<void> {
    if (compiling || !editors.figure || !editors.mpostdef || !editors.mposttex)
      return;
    const isAuto = options?.auto ?? false;
    compiling = true;
    statusEl.textContent = isAuto ? "自动编译中…" : "编译中…";
    statusEl.className = "status-pill";
    persist();

    try {
      const result = await compileFigure({
        figure: getEditorValue(editors.figure),
        mpostdef: getEditorValue(editors.mpostdef),
        mposttex: getEditorValue(editors.mposttex),
        plugin_paths: getPluginPaths(),
        search_paths: getSnippetSearchPaths(),
      });

      logEl.textContent = result.log || result.mp_source;

      if (editors.figure) {
        if (result.ok) {
          clearCompileDiagnostics(editors.figure);
        } else {
          setCompileDiagnostics(editors.figure, result.diagnostics ?? []);
        }
      }

      if (result.ok && result.svg) {
        logDrawerEl.classList.add("collapsed");
        setPreviewTab("graphic");
        previewGraphicEl.innerHTML = "";
        previewGraphicEl.insertAdjacentHTML("beforeend", result.svg);
        fitPreviewSvg();
        statusEl.textContent = isAuto ? "已自动更新预览" : "编译成功";
        statusEl.className = "status-pill ok";
      } else {
        if (!isAuto) logDrawerEl.classList.remove("collapsed");
        previewGraphicEl.innerHTML = "";
        previewGraphicEl.appendChild(
          el("div", "preview-placeholder", "编译失败，请查看下方日志"),
        );
        statusEl.textContent = isAuto ? "自动编译失败" : "编译失败";
        statusEl.className = "status-pill err";
      }
    } catch (err) {
      logEl.textContent = err instanceof Error ? err.message : String(err);
      if (editors.figure) clearCompileDiagnostics(editors.figure);
      if (!isAuto) logDrawerEl.classList.remove("collapsed");
      statusEl.textContent = "服务错误";
      statusEl.className = "status-pill err";
    } finally {
      compiling = false;
    }
  }

  function setSidebarTab(id: string): void {
    const root = document.querySelector(".sidebar");
    if (!root) return;
    root.querySelectorAll(".sidebar-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-pane") === id);
    });
    root.querySelectorAll(".sidebar-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.getAttribute("data-pane") === id);
    });
  }

  function setupRowSplitter(
    splitter: HTMLElement,
    before: HTMLElement,
    after: HTMLElement,
    axis: "row" | "col",
  ): void {
    let dragging = false;
    splitter.addEventListener("pointerdown", (e) => {
      dragging = true;
      splitter.setPointerCapture(e.pointerId);
    });
    splitter.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const parent = before.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const ratio =
        axis === "col"
          ? (e.clientY - rect.top) / rect.height
          : (e.clientX - rect.left) / rect.width;
      const clamped = Math.min(0.78, Math.max(0.22, ratio));
      before.style.flex = `${clamped} 1 0%`;
      after.style.flex = `${1 - clamped} 1 0%`;
    });
    const end = (e: PointerEvent) => {
      dragging = false;
      try {
        splitter.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    splitter.addEventListener("pointerup", end);
    splitter.addEventListener("pointercancel", end);
  }

  function fitPreviewSvg(): void {
    const svg = previewGraphicEl.querySelector("svg");
    if (!svg) return;
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.display = "block";
  }

  // —— Header ——
  const header = el("div", "app-header");
  const brand = el("div", "app-brand");
  brand.appendChild(el("div", "app-brand-mark", "MP"));
  brand.appendChild(el("h1", undefined, "MetaPostGUI"));
  header.appendChild(brand);

  const headerActions = el("div", "header-actions");
  const compileBtn = el("button", "primary", "编译");
  compileBtn.title = "Ctrl+R / ⌘R";
  compileBtn.addEventListener("click", () => void runCompile());
  headerActions.appendChild(compileBtn);

  headerActions.appendChild(el("span", "header-divider"));

  const exportMpBtn = el("button", undefined, ".mp");
  exportMpBtn.title = "查看拼装后的 .mp 源码";
  exportMpBtn.addEventListener("click", () => {
    setPreviewTab("mp");
    void refreshMpSource();
  });
  headerActions.appendChild(exportMpBtn);

  const exportInlBtn = el("button", undefined, "mpostinl");
  exportInlBtn.title = "查看拼装后的 mpostinl 源码";
  exportInlBtn.addEventListener("click", () => {
    setPreviewTab("mpostinl");
    void refreshInlSource();
  });
  headerActions.appendChild(exportInlBtn);

  headerActions.appendChild(el("span", "header-divider"));

  const sketchFileInput = document.createElement("input");
  sketchFileInput.type = "file";
  sketchFileInput.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
  sketchFileInput.hidden = true;

  const sketchUploadBtn = document.createElement("button");
  sketchUploadBtn.type = "button";
  sketchUploadBtn.className = "ghost header-sketch-btn";
  sketchUploadBtn.textContent = "草图…";
  sketchUploadBtn.title = "上传参考草图作为背景，便于描摹路径";

  const sketchOpacityWrap = el("label", "sketch-opacity-wrap header-sketch-opacity");
  sketchOpacityWrap.hidden = true;
  const sketchOpacityRange = document.createElement("input");
  sketchOpacityRange.type = "range";
  sketchOpacityRange.min = "0.1";
  sketchOpacityRange.max = "1";
  sketchOpacityRange.step = "0.05";
  sketchOpacityRange.value = "0.45";
  sketchOpacityRange.title = "草图透明度";
  sketchOpacityWrap.append("透明度 ", sketchOpacityRange);

  const sketchClearBtn = document.createElement("button");
  sketchClearBtn.type = "button";
  sketchClearBtn.className = "ghost header-sketch-btn";
  sketchClearBtn.textContent = "清除草图";
  sketchClearBtn.hidden = true;

  const sketchEditBtn = document.createElement("button");
  sketchEditBtn.type = "button";
  sketchEditBtn.className = "ghost header-sketch-btn";
  sketchEditBtn.textContent = "调整草图";
  sketchEditBtn.title = "平移/缩放草图（不影响坐标网格与图元）";
  sketchEditBtn.hidden = true;

  const sketchFitBtn = document.createElement("button");
  sketchFitBtn.type = "button";
  sketchFitBtn.className = "ghost header-sketch-btn";
  sketchFitBtn.textContent = "适应视口";
  sketchFitBtn.title = "将草图重新居中铺满当前视口";
  sketchFitBtn.hidden = true;

  const SKETCH_EDIT_HINT =
    "草图模式：拖动平移草图；⌘/Ctrl+滚轮缩放草图；双指滑动平移；Esc 退出";

  function refreshToolHint(): void {
    if (canvas.getSketchEditMode()) {
      toolHintEl.textContent = SKETCH_EDIT_HINT;
      return;
    }
    toolHintEl.textContent = TOOL_HINTS[currentTool];
  }

  function updateSketchUi(sketch: SketchBackground | null): void {
    const has = !!sketch;
    sketchOpacityWrap.hidden = !has;
    sketchClearBtn.hidden = !has;
    sketchEditBtn.hidden = !has;
    sketchFitBtn.hidden = !has;
    if (!has) {
      canvas.setSketchEditMode(false);
      sketchEditBtn.classList.remove("active");
    }
    if (sketch) sketchOpacityRange.value = String(sketch.opacity);
    refreshToolHint();
  }

  function applySketch(sketch: SketchInput | null): void {
    canvas.setSketchBackground(sketch);
    const cur = canvas.getSketchBackground();
    persistSketch(cur);
    updateSketchUi(cur);
  }

  sketchUploadBtn.addEventListener("click", () => sketchFileInput.click());

  sketchFileInput.addEventListener("change", () => {
    const file = sketchFileInput.files?.[0];
    sketchFileInput.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const href = reader.result;
      if (typeof href !== "string") return;
      void (async () => {
        try {
          const { width, height } = await loadImageSize(href);
          const opacity = parseFloat(sketchOpacityRange.value) || 0.45;
          applySketch({ href, opacity, naturalWidth: width, naturalHeight: height });
        } catch {
          syncHintEl.textContent = "草图加载失败";
        }
      })();
    };
    reader.readAsDataURL(file);
  });

  sketchOpacityRange.addEventListener("input", () => {
    const cur = canvas.getSketchBackground();
    if (!cur) return;
    applySketch({ ...cur, opacity: parseFloat(sketchOpacityRange.value) });
  });

  sketchClearBtn.addEventListener("click", () => applySketch(null));

  sketchEditBtn.addEventListener("click", () => {
    if (!canvas.getSketchBackground()) return;
    const next = !canvas.getSketchEditMode();
    canvas.setSketchEditMode(next);
    sketchEditBtn.classList.toggle("active", next);
    refreshToolHint();
  });

  sketchFitBtn.addEventListener("click", () => {
    canvas.resetSketchToView();
    const cur = canvas.getSketchBackground();
    if (cur) persistSketch(cur);
  });

  headerActions.append(
    sketchFileInput,
    sketchUploadBtn,
    sketchOpacityWrap,
    sketchEditBtn,
    sketchFitBtn,
    sketchClearBtn,
  );

  header.appendChild(headerActions);
  header.appendChild(syncHintEl);
  header.appendChild(el("span", "header-spacer"));
  header.appendChild(statusEl);
  header.appendChild(el("span", "header-divider"));
  const sidebarToggleBtn = el("button", "icon-btn ghost sidebar-toggle-btn");
  sidebarToggleBtn.type = "button";
  sidebarToggleBtn.setAttribute("aria-label", "切换侧栏");
  setSidebarToggleIcon(sidebarToggleBtn, sidebarHidden);
  header.appendChild(sidebarToggleBtn);

  // —— Tool rail ——
  const railHandle = buildToolRail({
    initialTool: currentTool,
    onToolChange: (tool) => {
      currentTool = tool;
      canvas.setTool(tool);
      refreshToolHint();
    },
  });
  const toolRail = railHandle.root;

  const snapRailBtn = el("button", "tool-rail-btn snap-rail-btn", "⊞");
  snapRailBtn.title = snapEnabled ? "网格吸附：开" : "网格吸附：关";
  if (snapEnabled) snapRailBtn.classList.add("active");

  toolRail.appendChild(el("span", "tool-rail-sep"));

  const railFooter = el("div", "tool-rail-footer");
  snapRailBtn.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    snapCheck.checked = snapEnabled;
    canvas.setSnap(snapEnabled);
    snapRailBtn.classList.toggle("active", snapEnabled);
    snapRailBtn.title = snapEnabled ? "网格吸附：开" : "网格吸附：关";
    persist();
  });
  railFooter.appendChild(snapRailBtn);

  const undoBtn = el("button", "tool-rail-btn", "↶");
  undoBtn.title = "撤销 (Ctrl+Z)";
  undoBtn.addEventListener("click", () => undo());
  railFooter.appendChild(undoBtn);

  const redoBtn = el("button", "tool-rail-btn", "↷");
  redoBtn.title = "重做 (Ctrl+Shift+Z)";
  redoBtn.addEventListener("click", () => redo());
  railFooter.appendChild(redoBtn);

  toolRail.appendChild(railFooter);

  const snapCheck = document.createElement("input");
  snapCheck.type = "checkbox";
  snapCheck.checked = snapEnabled;
  snapCheck.hidden = true;

  // —— Workspace: canvas | preview (row), code (bottom) ——
  const workspace = el("div", "workspace");

  const workspaceMain = el("div", "workspace-main");

  const canvasSection = el("div", "workspace-canvas");
  const canvasBar = el("div", "panel-bar");
  canvasBar.appendChild(el("span", "panel-bar-title", "编辑"));
  canvasBar.appendChild(toolHintEl);

  const savedSketch = loadPersistedSketch();
  if (savedSketch) {
    void loadImageSize(savedSketch.href)
      .then(({ width, height }) =>
        applySketch({
          ...savedSketch,
          naturalWidth: savedSketch.naturalWidth || width,
          naturalHeight: savedSketch.naturalHeight || height,
        }),
      )
      .catch(() => persistSketch(null));
  }

  canvasSection.appendChild(canvasBar);
  canvasSection.appendChild(canvasMount);

  const canvasPreviewSplitter = el("div", "workspace-splitter workspace-splitter-col");
  canvasPreviewSplitter.title = "拖动调整编辑区与预览区宽度";

  const previewSection = el("div", "workspace-preview");
  const previewBar = el("div", "panel-bar preview-bar");
  previewBar.appendChild(el("span", "panel-bar-title", "预览"));

  const previewTabs = el("div", "tabs preview-tabs");
  const previewPanesWrap = el("div", "preview-panes");

  let previewMpEditor: EditorView | null = null;
  let previewInlEditor: EditorView | null = null;
  let previewPluginsEditor: EditorView | null = null;
  let lastMpExport: ExportResponse | null = null;
  let lastInlExport: ExportResponse | null = null;
  let lastPluginsExport: ExportResponse | null = null;
  let currentPreviewTab: PreviewTabId = "graphic";

  const previewMpMount = el("div", "preview-source-mount");
  const previewInlMount = el("div", "preview-source-mount");
  const previewPluginsMount = el("div", "preview-source-mount");

  const previewGraphicPane = el("div", "preview-pane active");
  previewGraphicPane.dataset.preview = "graphic";
  previewGraphicPane.appendChild(previewGraphicEl);

  const previewMpPane = el("div", "preview-pane");
  previewMpPane.dataset.preview = "mp";
  previewMpPane.appendChild(previewMpMount);

  const previewInlPane = el("div", "preview-pane");
  previewInlPane.dataset.preview = "mpostinl";
  previewInlPane.appendChild(previewInlMount);

  const previewPluginsPane = el("div", "preview-pane");
  previewPluginsPane.dataset.preview = "plugins";
  previewPluginsPane.appendChild(previewPluginsMount);

  previewPanesWrap.append(previewGraphicPane, previewMpPane, previewInlPane, previewPluginsPane);

  const previewSourceActions = el("div", "panel-bar-actions preview-bar-actions");
  previewSourceActions.hidden = true;

  const previewRefreshBtn = el("button", "ghost", "刷新");
  previewRefreshBtn.title = "根据当前面板内容重新生成源码";
  const previewCopyBtn = el("button", "ghost", "复制全文");
  previewCopyBtn.title = "复制完整 .tex 到剪贴板";
  const previewCopyFigBtn = el("button", "ghost", "复制图段");
  previewCopyFigBtn.title = "仅复制 \\begin{mpostfig}…\\end{mpostfig} 段";
  previewCopyFigBtn.hidden = true;
  const previewDownloadBtn = el("button", "ghost", "下载");
  previewSourceActions.append(
    previewRefreshBtn,
    previewCopyBtn,
    previewCopyFigBtn,
    previewDownloadBtn,
  );

  async function refreshMpSource(): Promise<void> {
    if (!editors.figure || !editors.mpostdef || !editors.mposttex) return;
    persist();
    try {
      const res = await exportMp({
        figure: getEditorValue(editors.figure),
        mpostdef: getEditorValue(editors.mpostdef),
        mposttex: getEditorValue(editors.mposttex),
        plugin_paths: getPluginPaths(),
        search_paths: getSnippetSearchPaths(),
      });
      lastMpExport = res;
      if (!previewMpEditor) {
        previewMpEditor = createReadonlyEditor(previewMpMount, res.content);
      } else {
        setEditorValue(previewMpEditor, res.content);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!previewMpEditor) {
        previewMpEditor = createReadonlyEditor(previewMpMount, `// 生成失败\n// ${msg}`);
      } else {
        setEditorValue(previewMpEditor, `// 生成失败\n// ${msg}`);
      }
    }
  }

  async function refreshPluginsSource(): Promise<void> {
    if (!editors.mpostdef) return;
    persist();
    try {
      const res = await discoverMacros({
        mpostdef: getEditorValue(editors.mpostdef),
        resolve_inputs: true,
        search_paths: getSnippetSearchPaths(),
        plugin_paths: getPluginPaths(),
      });
      const content =
        res.plugin_source?.trim() ||
        (res.plugins?.length
          ? "% 未返回 plugin_source，请确认服务已更新"
          : "% 未加载任何插件\n% 内置：config/plugins/  用户：~/.metapostgui/plugins/");
      lastPluginsExport = { filename: "plugins.mp", content };
      if (!previewPluginsEditor) {
        previewPluginsEditor = createReadonlyEditor(previewPluginsMount, content);
      } else {
        setEditorValue(previewPluginsEditor, content);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const content = `% 加载失败\n% ${msg}`;
      lastPluginsExport = { filename: "plugins.mp", content };
      if (!previewPluginsEditor) {
        previewPluginsEditor = createReadonlyEditor(previewPluginsMount, content);
      } else {
        setEditorValue(previewPluginsEditor, content);
      }
    }
  }

  async function refreshInlSource(): Promise<void> {
    if (!editors.figure) return;
    persist();
    try {
      const res = await exportMpostinl({
        figure: getEditorValue(editors.figure),
        mpostdef: editors.mpostdef ? getEditorValue(editors.mpostdef) : "",
        mposttex: editors.mposttex ? getEditorValue(editors.mposttex) : "",
        label: exportLabelInput.value || "fig-demo",
        mpostdef_path: mpostdefPathInput.value,
        mposttex_path: mposttexPathInput.value,
        show: true,
        plugin_paths: getPluginPaths(),
        search_paths: getSnippetSearchPaths(),
      });
      lastInlExport = res;
      if (!previewInlEditor) {
        previewInlEditor = createReadonlyEditor(previewInlMount, res.content, "mpostinl");
      } else {
        setEditorValue(previewInlEditor, res.content);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!previewInlEditor) {
        previewInlEditor = createReadonlyEditor(previewInlMount, `% 生成失败\n% ${msg}`, "mpostinl");
      } else {
        setEditorValue(previewInlEditor, `% 生成失败\n% ${msg}`);
      }
    }
  }

  function setPreviewTab(id: PreviewTabId): void {
    currentPreviewTab = id;
    previewTabs.querySelectorAll(".preview-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-preview") === id);
    });
    previewPanesWrap.querySelectorAll(".preview-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.getAttribute("data-preview") === id);
    });
    previewSourceActions.hidden = id === "graphic";
    previewCopyFigBtn.hidden = id !== "mpostinl";
    previewCopyBtn.textContent = id === "mpostinl" ? "复制全文" : "复制";
    if (id === "mpostinl" && !lastInlExport) void refreshInlSource();
  }

  for (const [id, label] of [
    ["graphic", "图形"],
    ["mp", ".mp"],
    ["mpostinl", "mpostinl"],
    ["plugins", "插件"],
  ] as const) {
    const tabBtn = el("button", "preview-tab tab", label);
    tabBtn.type = "button";
    tabBtn.dataset.preview = id;
    tabBtn.addEventListener("click", () => {
      setPreviewTab(id);
      if (id === "mp") void refreshMpSource();
      if (id === "mpostinl") void refreshInlSource();
      if (id === "plugins") void refreshPluginsSource();
    });
    if (id === "graphic") tabBtn.classList.add("active");
    previewTabs.appendChild(tabBtn);
  }

  previewRefreshBtn.addEventListener("click", () => {
    if (currentPreviewTab === "mp") void refreshMpSource();
    if (currentPreviewTab === "mpostinl") void refreshInlSource();
    if (currentPreviewTab === "plugins") void refreshPluginsSource();
  });

  previewCopyBtn.addEventListener("click", async () => {
    const exportRes =
      currentPreviewTab === "mp"
        ? lastMpExport
        : currentPreviewTab === "mpostinl"
          ? lastInlExport
          : currentPreviewTab === "plugins"
            ? lastPluginsExport
            : null;
    if (!exportRes) return;
    try {
      await navigator.clipboard.writeText(exportRes.content);
      previewCopyBtn.textContent = "已复制";
      setTimeout(() => {
        previewCopyBtn.textContent = currentPreviewTab === "mpostinl" ? "复制全文" : "复制";
      }, 1200);
    } catch {
      /* ignore */
    }
  });

  previewCopyFigBtn.addEventListener("click", async () => {
    if (!lastInlExport?.figure_snippet) return;
    try {
      await navigator.clipboard.writeText(lastInlExport.figure_snippet);
      previewCopyFigBtn.textContent = "已复制";
      setTimeout(() => {
        previewCopyFigBtn.textContent = "图段";
      }, 1200);
    } catch {
      /* ignore */
    }
  });

  previewDownloadBtn.addEventListener("click", () => {
    const exportRes =
      currentPreviewTab === "mp"
        ? lastMpExport
        : currentPreviewTab === "mpostinl"
          ? lastInlExport
          : currentPreviewTab === "plugins"
            ? lastPluginsExport
            : null;
    if (!exportRes) return;
    downloadText(exportRes.filename, exportRes.content);
  });

  previewBar.append(previewTabs, previewSourceActions);
  previewSection.append(previewBar, previewPanesWrap);

  workspaceMain.append(canvasSection, canvasPreviewSplitter, previewSection);
  setupRowSplitter(canvasPreviewSplitter, canvasSection, previewSection, "row");

  const codeSplitter = el("div", "workspace-splitter workspace-splitter-row");
  codeSplitter.title = "拖动调整画布与代码区域高度";

  const codeSection = el("div", "workspace-code");
  const codeBar = el("div", "panel-bar");
  const codeTabs = el("div", "tabs");
  for (const [id, label] of [
    ["figure", "图元"],
    ["mpostdef", "mpostdef"],
    ["mposttex", "mposttex"],
  ] as const) {
    const tabBtn = el("button", "code-tab tab", label);
    tabBtn.dataset.tab = id;
    tabBtn.addEventListener("click", () => setTab(id));
    codeTabs.appendChild(tabBtn);
  }
  codeBar.appendChild(codeTabs);
  codeSection.appendChild(codeBar);
  codeSection.appendChild(editorMount);

  workspace.append(workspaceMain, codeSplitter, codeSection);
  setupRowSplitter(codeSplitter, workspaceMain, codeSection, "col");

  // —— Right sidebar (属性 / 宏 / 设置) ——
  const sidebar = el("div", "sidebar");
  const sidebarTabs = el("div", "sidebar-tabs");
  const sidebarPanes = el("div", "sidebar-panes");

  const paneDefs = [
    ["props", "属性"],
    ["macros", "宏"],
    ["examples", "例子"],
    ["project", "设置"],
  ] as const;

  for (const [id, label] of paneDefs) {
    const tabBtn = el("button", "sidebar-tab", label);
    tabBtn.type = "button";
    tabBtn.dataset.pane = id;
    tabBtn.addEventListener("click", () => setSidebarTab(id));
    if (id === "props") tabBtn.classList.add("active");
    sidebarTabs.appendChild(tabBtn);
  }

  const propsPane = el("div", "sidebar-pane active");
  propsPane.dataset.pane = "props";

  const macrosPane = el("div", "sidebar-pane");
  macrosPane.dataset.pane = "macros";

  const examplesPane = el("div", "sidebar-pane");
  examplesPane.dataset.pane = "examples";

  propsPanel = createPropertiesPanel(propsPane, {
    getSelectedShape: () => canvas.getSelectedShape(),
    onUpdateStyle: (id, style) => canvas.updateShapeStyle(id, style),
    onUpdateGeometry: (shape) => canvas.updateShapeGeometry(shape.id, shape),
  });

  macroPanel = createMacroPanel(macrosPane, {
    getMpostdef: () => (editors.mpostdef ? getEditorValue(editors.mpostdef) : ""),
    getSearchPaths: getSnippetSearchPaths,
    getPluginPaths,
    getScene: () => canvas.getScene(),
    onInsert(scene) {
      history.record(canvas.getScene());
      applyScene(scene);
    },
  });
  propsPanel.refresh();

  createExamplesPanel(examplesPane, {
    getParseHint: (code) => sync.getParseHint(code),
    onLoadExample(ex: ExampleEntry) {
      if (editors.figure && ex.figure) {
        setEditorValue(editors.figure, ex.figure);
        debouncedCodeToCanvas();
        setTab("figure");
      }
      if (editors.mpostdef && ex.mpostdef?.trim()) {
        setEditorValue(editors.mpostdef, ex.mpostdef);
        void macroPanel.refresh();
      }
      if (editors.mposttex && ex.mposttex?.trim()) {
        setEditorValue(editors.mposttex, ex.mposttex);
      }
      syncHintEl.textContent = `已加载例子：${ex.title}`;
      scheduleAutoPreview();
      persist();
    },
  });

  const projectPane = el("div", "sidebar-pane project-pane");
  projectPane.dataset.pane = "project";
  const projectScroll = el("div", "project-pane-scroll");

  const previewSection_settings = projectSection("预览");
  const autoPreviewLabel = el("label", "project-field project-field-check");
  const autoPreviewCheck = document.createElement("input");
  autoPreviewCheck.type = "checkbox";
  autoPreviewCheck.checked = autoPreview;
  autoPreviewCheck.addEventListener("change", () => {
    autoPreview = autoPreviewCheck.checked;
    persist();
    if (autoPreview) scheduleAutoPreview();
  });
  autoPreviewLabel.append(
    autoPreviewCheck,
    el("span", "project-field-check-label", "自动编译图形预览"),
  );
  previewSection_settings.appendChild(autoPreviewLabel);

  const texSection = projectSection("TeX / MetaPost");
  texSection.appendChild(texBinStatusEl);
  const texBinActions = el("div", "project-field-actions");
  const texBinApplyBtn = el("button", "ghost project-action-btn", "应用路径");
  texBinApplyBtn.type = "button";
  const texBinClearBtn = el("button", "ghost project-action-btn", "清除手动");
  texBinClearBtn.type = "button";
  const texBinScanBtn = el("button", "ghost project-action-btn", "重新搜索");
  texBinScanBtn.type = "button";
  texBinApplyBtn.addEventListener("click", () => {
    void (async () => {
      try {
        await setTexBin(texBinInput.value.trim());
        await refreshTexToolchain();
        syncHintEl.textContent = "TeX 路径已保存";
      } catch (err) {
        texBinHintEl.textContent = err instanceof Error ? err.message : "保存失败";
      }
    })();
  });
  texBinClearBtn.addEventListener("click", () => {
    texBinInput.value = "";
    void (async () => {
      try {
        await setTexBin("");
        await refreshTexToolchain();
        syncHintEl.textContent = "已清除手动路径，使用自动搜索";
      } catch (err) {
        texBinHintEl.textContent = err instanceof Error ? err.message : "清除失败";
      }
    })();
  });
  texBinScanBtn.addEventListener("click", () => {
    void refreshTexToolchain();
  });
  texBinActions.append(texBinApplyBtn, texBinClearBtn, texBinScanBtn);
  texSection.append(projectField("tex bin 目录（手动）", texBinInput), texBinActions, texBinHintEl);

  const exportSection = projectSection("导出");
  exportSection.append(
    projectField("mpostdef 相对路径", mpostdefPathInput),
    projectField("mposttex 相对路径", mposttexPathInput),
    projectField("导出标签名", exportLabelInput),
  );

  const macroSection = projectSection("宏库");
  snippetPathInput.addEventListener("change", () => {
    persist();
    void macroPanel.refresh();
  });
  macroSection.append(
    projectField("input 搜索路径（可选）", snippetPathInput),
    projectHint(
      "留空时服务端会自动尝试 MetaPostGUI 旁的 MetaPost-Script/snippets。用于宏面板与编译预览内联展开 input；独立 TeX 工程须让 mpost 能找到片段（并列放置或 make install-texmf）。见 docs/EXTENDING.md。",
    ),
  );
  pluginPathInput.addEventListener("change", () => {
    persist();
    void macroPanel.refresh();
  });
  macroSection.appendChild(projectField("插件目录", pluginPathInput));

  projectScroll.append(
    previewSection_settings,
    texSection,
    exportSection,
    macroSection,
  );
  projectPane.appendChild(projectScroll);

  sidebarPanes.append(propsPane, macrosPane, examplesPane, projectPane);
  sidebar.append(sidebarTabs, sidebarPanes);

  const appBody = el("div", "app-body");
  appBody.append(toolRail, workspace, sidebar);

  function applySidebarVisibility(): void {
    appBody.classList.toggle("sidebar-hidden", sidebarHidden);
    sidebarToggleBtn.classList.toggle("active", !sidebarHidden);
    setSidebarToggleIcon(sidebarToggleBtn, sidebarHidden);
    sidebarToggleBtn.title = sidebarHidden ? "显示侧栏 (Ctrl+B / ⌘B)" : "隐藏侧栏 (Ctrl+B / ⌘B)";
    sidebarToggleBtn.setAttribute("aria-pressed", sidebarHidden ? "false" : "true");
  }

  function toggleSidebar(): void {
    sidebarHidden = !sidebarHidden;
    applySidebarVisibility();
    persist();
  }

  sidebarToggleBtn.addEventListener("click", () => toggleSidebar());
  applySidebarVisibility();

  // —— Log drawer ——
  const logDrawer = el("div", "log-drawer collapsed");
  logDrawerEl = logDrawer;
  const logHeader = el("div", "log-drawer-header");
  const logChevron = el("span", "log-drawer-chevron", "▼");
  const logCopyBtn = document.createElement("button");
  logCopyBtn.type = "button";
  logCopyBtn.className = "ghost log-copy-btn";
  logCopyBtn.textContent = "复制";
  logCopyBtn.title = "复制编译日志";
  logCopyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = logEl.textContent ?? "";
    void navigator.clipboard.writeText(text).then(
      () => {
        logCopyBtn.textContent = "已复制";
        setTimeout(() => {
          logCopyBtn.textContent = "复制";
        }, 1200);
      },
      () => {
        syncHintEl.textContent = "无法复制日志";
      },
    );
  });
  logHeader.append(logChevron, document.createTextNode(" 编译日志"), logCopyBtn);
  logHeader.addEventListener("click", () => {
    logDrawer.classList.toggle("collapsed");
  });
  logDrawer.append(logHeader, logEl);

  const root = el("div", "app");
  root.append(header, appBody, logDrawer);
  app.appendChild(root);

  // Init editors & sync canvas from figure code
  setTab("figure");
  editors.mpostdef = createEditor(document.createElement("div"), saved.mpostdef ?? "", () => {
    persist();
    void macroPanel.refresh();
    scheduleAutoPreview();
  });
  editors.mposttex = createEditor(document.createElement("div"), saved.mposttex ?? "", () => {
    persist();
    scheduleAutoPreview();
  }, "latex");

  if (editors.figure) {
    const initialFigure = getEditorValue(editors.figure);
    sync.pushCodeToCanvas(initialFigure);
    syncHintEl.textContent = sync.getParseHint(initialFigure);
    propsPanel.refresh();
  }

  try {
    await refreshTexToolchain();
  } catch {
    statusEl.textContent = "请先运行 ./scripts/dev.sh";
    statusEl.className = "status err";
  }

  await ensureMpostdefReady();
  scheduleAutoPreview();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.activeElement?.closest(".macro-dialog")) return;
      if (canvas.getSketchEditMode()) {
        e.preventDefault();
        canvas.setSketchEditMode(false);
        sketchEditBtn.classList.remove("active");
        refreshToolHint();
        return;
      }
      if (currentTool === "select") return;
      e.preventDefault();
      railHandle.setActiveTool("select");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      canvas.resetView();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "r") {
      e.preventDefault();
      void runCompile();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      if (document.activeElement?.closest(".cm-editor")) return;
      e.preventDefault();
      undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) {
      if (document.activeElement?.closest(".cm-editor")) return;
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Enter" && currentTool === "polyline") {
      canvas.finishPolyline();
    }
    if (e.key === "Enter" && currentTool === "mpath") {
      canvas.finishMpath();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (document.activeElement?.closest(".cm-editor")) return;
      if (document.activeElement?.closest(".macro-dialog")) return;
      canvas.deleteSelected();
    }
  });
}
