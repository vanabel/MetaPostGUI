import type { ExampleEntry, ExamplesListResponse } from "./types";

export type ExamplesPanelApi = {
  onLoadExample: (entry: ExampleEntry) => void;
  getParseHint?: (code: string) => string;
};

export function createExamplesPanel(
  mount: HTMLElement,
  api: ExamplesPanelApi,
): { refresh: () => Promise<void> } {
  const filterRow = document.createElement("div");
  filterRow.className = "examples-filter";

  const scopeSelect = document.createElement("select");
  scopeSelect.className = "examples-select";
  for (const [val, label] of [
    ["featured", "精选代表"],
    ["all", "全部例子"],
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    scopeSelect.appendChild(opt);
  }

  const levelSelect = document.createElement("select");
  levelSelect.className = "examples-select";
  for (const [val, label] of [
    ["", "全部层级"],
    ["basic", "基础"],
    ["intermediate", "中等"],
    ["advanced", "高级"],
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    levelSelect.appendChild(opt);
  }

  const categorySelect = document.createElement("select");
  categorySelect.className = "examples-select";
  for (const [val, label] of [
    ["", "全部分类"],
    ["basic", "basic"],
    ["path", "path"],
    ["pen", "pen"],
    ["label", "label"],
    ["macro", "macro"],
    ["advanced", "advanced"],
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    categorySelect.appendChild(opt);
  }

  const tierSelect = document.createElement("select");
  tierSelect.className = "examples-select";
  for (const [val, label] of [
    ["", "全部 tier"],
    ["A", "A"],
    ["B", "B"],
    ["C", "C"],
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    tierSelect.appendChild(opt);
  }

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "examples-search";
  searchInput.placeholder = "搜索标题 / id";

  filterRow.append(scopeSelect, levelSelect, categorySelect, tierSelect, searchInput);

  const listEl = document.createElement("div");
  listEl.className = "examples-list";

  const detailEl = document.createElement("div");
  detailEl.className = "examples-detail";

  mount.append(filterRow, listEl, detailEl);

  let all: ExampleEntry[] = [];

  function renderList(): void {
    const scope = scopeSelect.value;
    const level = levelSelect.value;
    const cat = categorySelect.value;
    const tier = tierSelect.value;
    const q = searchInput.value.trim().toLowerCase();
    listEl.innerHTML = "";
    const sorted = [...all].sort((a, b) => {
      const ao = a.featured_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.featured_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    });
    const filtered = sorted.filter((ex) => {
      if (scope === "featured" && !ex.featured_level) return false;
      if (level && ex.featured_level !== level) return false;
      if (cat && ex.category !== cat) return false;
      if (tier && ex.tier !== tier) return false;
      if (q) {
        const hay = `${ex.id} ${ex.title} ${ex.description ?? ""} ${ex.featured_reason ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    for (const ex of filtered.slice(0, 120)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "examples-item";
      btn.dataset.id = ex.id;
      const title = document.createElement("span");
      title.className = "examples-item-title";
      title.textContent = ex.title;
      const meta = document.createElement("span");
      meta.className = "examples-item-meta";
      meta.textContent = `${featuredLevelLabel(ex.featured_level) ?? `tier ${ex.tier}`} · ${ex.category}`;
      btn.append(title, meta);
      btn.addEventListener("click", () => {
        void showDetail(ex.id);
      });
      listEl.appendChild(btn);
    }
    if (filtered.length > 120) {
      const more = document.createElement("p");
      more.className = "examples-more";
      more.textContent = `另有 ${filtered.length - 120} 条，请缩小筛选范围`;
      listEl.appendChild(more);
    }
    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "examples-more";
      empty.textContent = "没有匹配的例子";
      listEl.appendChild(empty);
    }
  }

  async function showDetail(id: string): Promise<void> {
    const res = await fetch(`/api/examples/${encodeURIComponent(id)}`);
    if (!res.ok) {
      detailEl.textContent = "无法加载例子";
      return;
    }
    const ex = (await res.json()) as ExampleEntry;
    detailEl.innerHTML = "";
    const h = document.createElement("h3");
    h.className = "examples-detail-title";
    h.textContent = ex.title;
    detailEl.appendChild(h);
    if (ex.description) {
      const p = document.createElement("p");
      p.className = "examples-detail-desc";
      p.textContent = ex.description;
      detailEl.appendChild(p);
    }
    if (ex.featured_reason) {
      const p = document.createElement("p");
      p.className = "examples-detail-desc";
      p.textContent = ex.featured_reason;
      detailEl.appendChild(p);
    }
    const meta = document.createElement("p");
    meta.className = "examples-detail-meta";
    const level = featuredLevelLabel(ex.featured_level);
    meta.textContent = `${ex.id} · ${ex.source} · ${level ?? `tier ${ex.tier}`}`;
    detailEl.appendChild(meta);
    if (ex.features?.length) {
      const feat = document.createElement("p");
      feat.className = "examples-detail-warn";
      feat.textContent = `特性：${ex.features.join(", ")}（画布可能仅预览代码）`;
      detailEl.appendChild(feat);
    }
    if (api.getParseHint && ex.figure) {
      const hint = document.createElement("p");
      hint.className = "examples-detail-hint";
      hint.textContent = api.getParseHint(ex.figure);
      detailEl.appendChild(hint);
    }
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "primary examples-load-btn";
    loadBtn.textContent = "加载到编辑器";
    loadBtn.addEventListener("click", () => api.onLoadExample(ex));
    detailEl.appendChild(loadBtn);
  }

  async function refresh(): Promise<void> {
    try {
      const res = await fetch("/api/examples");
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as ExamplesListResponse;
      all = data.examples;
      renderList();
    } catch {
      listEl.textContent = "无法加载例子清单（API 未启动？）";
    }
  }

  categorySelect.addEventListener("change", renderList);
  scopeSelect.addEventListener("change", renderList);
  levelSelect.addEventListener("change", renderList);
  tierSelect.addEventListener("change", renderList);
  searchInput.addEventListener("input", renderList);

  void refresh();
  return { refresh };
}

function featuredLevelLabel(level: ExampleEntry["featured_level"]): string | null {
  if (level === "basic") return "基础";
  if (level === "intermediate") return "中等";
  if (level === "advanced") return "高级";
  return null;
}
