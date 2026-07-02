import type { TexToolchainResponse } from "./api";

export function sourceLabel(source: string): string {
  if (source === "manual") return "手动设置";
  if (source === "env") return "环境变量";
  return "自动搜索";
}

/** 长路径只保留末尾若干段，悬停可看完整路径 */
export function shortenPath(path: string, tailSegments = 3): string {
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length <= tailSegments) {
    return norm.startsWith("/") ? `/${parts.join("/")}` : parts.join("/");
  }
  return `…/${parts.slice(-tailSegments).join("/")}`;
}

export function sharedToolBinDir(mpost: string | null, latex: string | null): string | null {
  if (!mpost || !latex) return null;
  const m = mpost.replace(/\\/g, "/");
  const l = latex.replace(/\\/g, "/");
  const mi = m.lastIndexOf("/");
  const li = l.lastIndexOf("/");
  if (mi < 0 || li < 0) return null;
  const md = m.slice(0, mi);
  const ld = l.slice(0, li);
  return md === ld ? md : null;
}

function toolFileName(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

export function renderTexToolchainStatus(root: HTMLElement, tc: TexToolchainResponse): void {
  root.replaceChildren();
  root.className = "tex-toolchain-status";

  if (!tc.mpost && !tc.latex) {
    root.textContent = "未找到 mpost / latex";
    return;
  }

  const header = document.createElement("div");
  header.className = "tex-toolchain-header";
  const badge = document.createElement("span");
  badge.className = "tex-toolchain-badge";
  badge.textContent = sourceLabel(tc.source);
  header.append(document.createTextNode("来源 "), badge);
  root.appendChild(header);

  const sharedDir = sharedToolBinDir(tc.mpost, tc.latex);
  if (sharedDir) {
    const dirRow = document.createElement("div");
    dirRow.className = "tex-toolchain-dir";
    const key = document.createElement("span");
    key.className = "tex-toolchain-key";
    key.textContent = "目录";
    const val = document.createElement("code");
    val.className = "tex-toolchain-path";
    val.textContent = shortenPath(sharedDir, 4);
    val.title = sharedDir;
    dirRow.append(key, val);
    root.appendChild(dirRow);
  }

  const list = document.createElement("dl");
  list.className = "tex-toolchain-tools";

  for (const key of ["mpost", "latex"] as const) {
    const path = tc[key];
    const row = document.createElement("div");
    row.className = "tex-toolchain-tool";

    const dt = document.createElement("dt");
    dt.textContent = key;

    const dd = document.createElement("dd");
    const code = document.createElement("code");
    code.className = "tex-toolchain-path";
    if (path) {
      code.textContent = sharedDir ? toolFileName(path) : shortenPath(path);
      code.title = path;
    } else {
      code.textContent = "未找到";
      code.classList.add("is-missing");
    }
    dd.appendChild(code);
    row.append(dt, dd);
    list.appendChild(row);
  }

  root.appendChild(list);
}
