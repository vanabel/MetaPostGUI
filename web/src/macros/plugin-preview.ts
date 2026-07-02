import { createReadonlyEditor, setEditorValue } from "../editor";
import type { PluginInfo } from "../api";
import type { EditorView } from "@codemirror/view";

export function showPluginSourceDialog(plugin: PluginInfo): void {
  const overlay = document.createElement("div");
  overlay.className = "macro-dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "macro-dialog macro-dialog-wide";

  const title = plugin.title || plugin.id;
  const meta = document.createElement("p");
  meta.className = "macro-dialog-note";
  const parts = [plugin.id];
  if (plugin.version) parts.push(`v${plugin.version}`);
  if (plugin.file) parts.push(plugin.file);
  meta.textContent = parts.join(" · ");

  const actions = document.createElement("div");
  actions.className = "macro-dialog-actions";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "复制";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "primary";
  closeBtn.textContent = "关闭";

  actions.append(copyBtn, closeBtn);

  dialog.innerHTML = `<h3>${title}</h3>`;
  dialog.appendChild(meta);

  if (plugin.description) {
    const desc = document.createElement("p");
    desc.className = "macro-dialog-note";
    desc.textContent = plugin.description;
    dialog.appendChild(desc);
  }

  if (plugin.tool_description || (plugin.param_docs && Object.keys(plugin.param_docs).length > 0)) {
    const docs = document.createElement("div");
    docs.className = "plugin-param-docs";
    if (plugin.tool_name) {
      const toolName = document.createElement("div");
      toolName.className = "plugin-param-docs-tool";
      toolName.textContent = `宏：${plugin.tool_name}`;
      docs.appendChild(toolName);
    }
    if (plugin.tool_description) {
      const toolDesc = document.createElement("p");
      toolDesc.className = "macro-dialog-note";
      toolDesc.textContent = plugin.tool_description;
      docs.appendChild(toolDesc);
    }
    if (plugin.param_docs && Object.keys(plugin.param_docs).length > 0) {
      const list = document.createElement("dl");
      list.className = "plugin-param-list";
      for (const [name, text] of Object.entries(plugin.param_docs)) {
        const dt = document.createElement("dt");
        dt.textContent = name;
        const dd = document.createElement("dd");
        dd.textContent = text;
        list.append(dt, dd);
      }
      docs.appendChild(list);
    }
    dialog.appendChild(docs);
  }

  const mount = document.createElement("div");
  mount.className = "plugin-source-mount";
  dialog.append(mount, actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let editor: EditorView | null = null;
  const source = plugin.source?.trim() || "% （无宏正文）";
  editor = createReadonlyEditor(mount, source);

  const close = () => overlay.remove();

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(source);
      copyBtn.textContent = "已复制";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    } catch {
      /* ignore */
    }
  });

  requestAnimationFrame(() => {
    if (editor) setEditorValue(editor, source);
  });
}
