import type { MacroTool } from "./registry";

export function showMacroDialog(tool: MacroTool): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "macro-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "macro-dialog";
    dialog.innerHTML = `<h3>${tool.name}</h3>`;

    if (tool.description) {
      const note = document.createElement("p");
      note.className = "macro-dialog-note";
      note.textContent = tool.description;
      dialog.appendChild(note);
    }

    const form = document.createElement("form");
    form.className = "macro-dialog-form";

    const fields: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};

    if (tool.name === "drawfun") {
      appendField(form, fields, "xmin", "expr xmin", tool.defaults.xmin ?? "-3");
      appendField(form, fields, "xmax", "expr xmax", tool.defaults.xmax ?? "3");
      appendField(form, fields, "xinc", "expr xinc", tool.defaults.xinc ?? "0.1");
      appendTextarea(form, fields, "f", "text f（函数体）", tool.defaults.f ?? "x");
    } else if (tool.params.length === 0) {
      const p = document.createElement("p");
      p.className = "macro-dialog-note";
      p.textContent = "此宏无参数，将插入空调用。";
      form.appendChild(p);
    } else {
      for (const param of tool.params) {
        const def = tool.defaults[param.name] ?? "";
        const label = `${param.kind} ${param.name}`;
        const hint = param.description;
        if (param.kind === "text" || param.name === "f") {
          appendTextarea(form, fields, param.name, label, def, hint);
        } else {
          appendField(form, fields, param.name, label, def, hint);
        }
      }
    }

    const actions = document.createElement("div");
    actions.className = "macro-dialog-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "取消";
    const okBtn = document.createElement("button");
    okBtn.type = "submit";
    okBtn.className = "primary";
    okBtn.textContent = "插入";
    actions.append(cancelBtn, okBtn);
    form.appendChild(actions);

    dialog.appendChild(form);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (result: Record<string, string> | null) => {
      overlay.remove();
      resolve(result);
    };

    cancelBtn.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const args: Record<string, string> = { ...tool.defaults };
      for (const [key, el] of Object.entries(fields)) {
        args[key] = el.value.trim();
      }
      close(args);
    });

    const first = Object.values(fields)[0];
    first?.focus();
  });
}

function appendField(
  form: HTMLFormElement,
  fields: Record<string, HTMLInputElement | HTMLTextAreaElement>,
  name: string,
  label: string,
  value: string,
  hint?: string,
): void {
  const wrap = document.createElement("label");
  wrap.className = "macro-dialog-field";
  const labelEl = document.createElement("span");
  labelEl.className = "macro-dialog-field-label";
  labelEl.textContent = label;
  wrap.appendChild(labelEl);
  if (hint) {
    const hintEl = document.createElement("span");
    hintEl.className = "macro-dialog-field-hint";
    hintEl.textContent = hint;
    wrap.appendChild(hintEl);
  }
  const input = document.createElement("input");
  input.type = "text";
  input.name = name;
  input.value = value;
  wrap.appendChild(input);
  form.appendChild(wrap);
  fields[name] = input;
}

function appendTextarea(
  form: HTMLFormElement,
  fields: Record<string, HTMLInputElement | HTMLTextAreaElement>,
  name: string,
  label: string,
  value: string,
  hint?: string,
): void {
  const wrap = document.createElement("label");
  wrap.className = "macro-dialog-field";
  const labelEl = document.createElement("span");
  labelEl.className = "macro-dialog-field-label";
  labelEl.textContent = label;
  wrap.appendChild(labelEl);
  if (hint) {
    const hintEl = document.createElement("span");
    hintEl.className = "macro-dialog-field-hint";
    hintEl.textContent = hint;
    wrap.appendChild(hintEl);
  }
  const ta = document.createElement("textarea");
  ta.name = name;
  ta.rows = 2;
  ta.value = value;
  wrap.appendChild(ta);
  form.appendChild(wrap);
  fields[name] = ta;
}
