import type { LPoint, MPathNode, PrimitiveShape, Shape, ShapeStyle } from "../scene/types";

export type PropertiesPanelOptions = {
  getSelectedShape: () => Shape | null;
  onUpdateStyle: (id: string, style: ShapeStyle) => void;
  onUpdateGeometry: (shape: PrimitiveShape) => void;
};

function parseNum(raw: string): number | null {
  const v = parseFloat(raw.trim());
  return Number.isFinite(v) ? v : null;
}

function parsePoint(xRaw: string, yRaw: string): LPoint | null {
  const x = parseNum(xRaw);
  const y = parseNum(yRaw);
  if (x === null || y === null) return null;
  return { x, y };
}

export function createPropertiesPanel(
  parent: HTMLElement,
  opts: PropertiesPanelOptions,
): { refresh: () => void } {
  const panel = document.createElement("div");
  panel.className = "props-panel";
  panel.innerHTML = `<div class="props-panel-title">图元属性</div>`;
  const body = document.createElement("div");
  body.className = "props-panel-body";
  panel.appendChild(body);
  parent.appendChild(panel);

  const withpenInput = document.createElement("input");
  withpenInput.type = "text";
  withpenInput.placeholder = "pencircle scaled 1.5pt";

  const labelInput = document.createElement("textarea");
  labelInput.rows = 2;
  labelInput.placeholder = "label.top(btex $x$ etex, (3u,2u))";

  const fillCheck = document.createElement("input");
  fillCheck.type = "checkbox";

  function applyStyle(): void {
    const shape = opts.getSelectedShape();
    if (!shape || shape.layer !== "primitive") return;
    opts.onUpdateStyle(shape.id, {
      withpen: withpenInput.value.trim() || undefined,
      label: labelInput.value.trim() || undefined,
      fill: fillCheck.checked || undefined,
    });
  }

  withpenInput.addEventListener("change", applyStyle);
  labelInput.addEventListener("change", applyStyle);
  fillCheck.addEventListener("change", applyStyle);

  function commitGeometry(next: PrimitiveShape): void {
    opts.onUpdateGeometry(next);
  }

  function mkNumInput(val: string, ph: string, onChange: (n: number) => void): HTMLInputElement {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "props-num";
    inp.value = val;
    inp.placeholder = ph;
    inp.addEventListener("change", () => {
      const n = parseNum(inp.value);
      if (n !== null) onChange(n);
    });
    return inp;
  }

  function appendPointRow(
    container: HTMLElement,
    label: string,
    p: LPoint,
    onChange: (p: LPoint) => void,
  ): void {
    const row = document.createElement("label");
    row.className = "props-field props-point-row";
    const title = document.createElement("span");
    title.textContent = label;
    row.appendChild(title);
    const xy = document.createElement("span");
    xy.className = "props-point-inputs";
    const xIn = mkNumInput(String(p.x), "x", (x) => {
      const np = parsePoint(String(x), yIn.value);
      if (np) onChange(np);
    });
    const yIn = mkNumInput(String(p.y), "y", (y) => {
      const np = parsePoint(xIn.value, String(y));
      if (np) onChange(np);
    });
    xy.append("(", xIn, ",", yIn, ")");
    row.appendChild(xy);
    container.appendChild(row);
  }

  function appendStyleFields(shape: PrimitiveShape, container: HTMLElement): void {
    const penLabel = document.createElement("label");
    penLabel.className = "props-field";
    penLabel.append("withpen");
    withpenInput.value = shape.style?.withpen ?? "";
    penLabel.appendChild(withpenInput);
    container.appendChild(penLabel);

    const fillLabel = document.createElement("label");
    fillLabel.className = "props-field props-check";
    fillLabel.append(fillCheck, " filldraw（填充）");
    fillCheck.checked = !!shape.style?.fill;
    container.appendChild(fillLabel);

    const labLabel = document.createElement("label");
    labLabel.className = "props-field";
    labLabel.append("label");
    labelInput.value = shape.style?.label ?? "";
    labLabel.appendChild(labelInput);
    container.appendChild(labLabel);
  }

  function appendGeometryEditor(shape: PrimitiveShape): void {
    const geom = document.createElement("div");
    geom.className = "props-geom";

    const title = document.createElement("p");
    title.className = "props-section-title";
    title.textContent = "几何";
    geom.appendChild(title);

    const patch = (fn: (s: PrimitiveShape) => PrimitiveShape): void => {
      commitGeometry(fn(shape));
    };

    switch (shape.kind) {
      case "dot":
      case "point":
        appendPointRow(geom, "位置", shape.p, (p) =>
          patch((s) => (s.kind === shape.kind ? { ...s, p } : s)),
        );
        break;
      case "segment":
      case "arrow":
        appendPointRow(geom, "起点", shape.a, (a) =>
          patch((s) => (s.kind === shape.kind ? { ...s, a } : s)),
        );
        appendPointRow(geom, "终点", shape.b, (b) =>
          patch((s) => (s.kind === shape.kind ? { ...s, b } : s)),
        );
        break;
      case "rect":
        appendPointRow(geom, "角点 A", shape.a, (a) =>
          patch((s) => (s.kind === "rect" ? { ...s, a } : s)),
        );
        appendPointRow(geom, "角点 B", shape.b, (b) =>
          patch((s) => (s.kind === "rect" ? { ...s, b } : s)),
        );
        break;
      case "circle":
        appendPointRow(geom, "圆心", shape.center, (center) =>
          patch((s) => (s.kind === "circle" ? { ...s, center } : s)),
        );
        {
          const rLabel = document.createElement("label");
          rLabel.className = "props-field";
          rLabel.append("半径 r");
          rLabel.appendChild(
            mkNumInput(String(shape.r), "r", (r) =>
              patch((s) => (s.kind === "circle" ? { ...s, r: Math.max(r, 0.05) } : s)),
            ),
          );
          geom.appendChild(rLabel);
        }
        break;
      case "ellipse":
        appendPointRow(geom, "中心", shape.center, (center) =>
          patch((s) => (s.kind === "ellipse" ? { ...s, center } : s)),
        );
        {
          const rxL = document.createElement("label");
          rxL.className = "props-field";
          rxL.append("rx");
          rxL.appendChild(
            mkNumInput(String(shape.rx), "rx", (rx) =>
              patch((s) =>
                s.kind === "ellipse" ? { ...s, rx: Math.max(rx, 0.05) } : s,
              ),
            ),
          );
          geom.appendChild(rxL);
          const ryL = document.createElement("label");
          ryL.className = "props-field";
          ryL.append("ry");
          ryL.appendChild(
            mkNumInput(String(shape.ry), "ry", (ry) =>
              patch((s) =>
                s.kind === "ellipse" ? { ...s, ry: Math.max(ry, 0.05) } : s,
              ),
            ),
          );
          geom.appendChild(ryL);
        }
        break;
      case "circle3":
        appendPointRow(geom, "点 A", shape.a, (a) =>
          patch((s) => (s.kind === "circle3" ? { ...s, a } : s)),
        );
        appendPointRow(geom, "点 B", shape.b, (b) =>
          patch((s) => (s.kind === "circle3" ? { ...s, b } : s)),
        );
        appendPointRow(geom, "点 C", shape.c, (c) =>
          patch((s) => (s.kind === "circle3" ? { ...s, c } : s)),
        );
        break;
      case "bezier":
        appendPointRow(geom, "起点", shape.a, (a) =>
          patch((s) => (s.kind === "bezier" ? { ...s, a } : s)),
        );
        appendPointRow(geom, "控制 1", shape.b, (b) =>
          patch((s) => (s.kind === "bezier" ? { ...s, b } : s)),
        );
        appendPointRow(geom, "控制 2", shape.c, (c) =>
          patch((s) => (s.kind === "bezier" ? { ...s, c } : s)),
        );
        appendPointRow(geom, "终点", shape.d, (d) =>
          patch((s) => (s.kind === "bezier" ? { ...s, d } : s)),
        );
        break;
      case "polyline":
        appendPolylineTable(geom, shape, patch);
        break;
      case "mpath":
        appendMpathTable(geom, shape, patch);
        break;
    }

    body.appendChild(geom);
  }

  function appendPolylineTable(
    container: HTMLElement,
    shape: PrimitiveShape & { kind: "polyline" },
    patch: (fn: (s: PrimitiveShape) => PrimitiveShape) => void,
  ): void {
    const wrap = document.createElement("div");
    wrap.className = "props-mpath-table-wrap";
    const table = document.createElement("table");
    table.className = "props-mpath-table";
    table.innerHTML = `<thead><tr><th>#</th><th>x</th><th>y</th></tr></thead>`;
    const tbody = document.createElement("tbody");

    const apply = (): void => {
      const pts: LPoint[] = [];
      for (const row of tbody.querySelectorAll("tr")) {
        const p = parsePoint(
          (row.querySelector(".pt-x") as HTMLInputElement).value,
          (row.querySelector(".pt-y") as HTMLInputElement).value,
        );
        if (!p) return;
        pts.push(p);
      }
      if (pts.length >= 2) {
        patch((s) => (s.kind === "polyline" ? { ...s, pts } : s));
      }
    };

    shape.pts.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="mpath-idx">${i}</td>`;
      const xIn = mkNumInput(String(p.x), "x", () => apply());
      xIn.className = "pt-x props-num";
      const yIn = mkNumInput(String(p.y), "y", () => apply());
      yIn.className = "pt-y props-num";
      tr.appendChild(document.createElement("td")).appendChild(xIn);
      tr.appendChild(document.createElement("td")).appendChild(yIn);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function appendMpathTable(
    container: HTMLElement,
    shape: PrimitiveShape & { kind: "mpath" },
    patch: (fn: (s: PrimitiveShape) => PrimitiveShape) => void,
  ): void {
    const hint = document.createElement("p");
    hint.className = "props-mpath-hint";
    hint.textContent =
      "MetaPost 语法：(-5,5){dir 0}..(-3,7.25)..… 。dir 为角度（度），留空则自动平滑。";
    container.appendChild(hint);

    const wrap = document.createElement("div");
    wrap.className = "props-mpath-table-wrap";
    const table = document.createElement("table");
    table.className = "props-mpath-table";
    table.innerHTML = `<thead><tr>
      <th>#</th><th>x</th><th>y</th><th>dir °</th>
    </tr></thead>`;
    const tbody = document.createElement("tbody");

    const apply = (): void => {
      const nodes: MPathNode[] = [];
      for (const row of tbody.querySelectorAll("tr")) {
        const p = parsePoint(
          (row.querySelector(".mpath-x") as HTMLInputElement).value,
          (row.querySelector(".mpath-y") as HTMLInputElement).value,
        );
        if (!p) return;
        const dirRaw = (row.querySelector(".mpath-dir") as HTMLInputElement).value.trim();
        let dir: number | undefined;
        if (dirRaw !== "") {
          const d = parseNum(dirRaw);
          if (d === null) return;
          dir = d;
        }
        nodes.push({ p, dir });
      }
      if (nodes.length >= 2) {
        patch((s) => (s.kind === "mpath" ? { ...s, nodes } : s));
      }
    };

    shape.nodes.forEach((n, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="mpath-idx">${i}</td>`;
      const xIn = mkNumInput(String(n.p.x), "x", () => apply());
      xIn.className = "mpath-x props-num";
      const yIn = mkNumInput(String(n.p.y), "y", () => apply());
      yIn.className = "mpath-y props-num";
      const dIn = mkNumInput(n.dir !== undefined ? String(n.dir) : "", "°", () => apply());
      dIn.className = "mpath-dir props-num";
      tr.appendChild(document.createElement("td")).appendChild(xIn);
      tr.appendChild(document.createElement("td")).appendChild(yIn);
      tr.appendChild(document.createElement("td")).appendChild(dIn);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function refresh(): void {
    const shape = opts.getSelectedShape();
    body.innerHTML = "";
    if (!shape || shape.layer !== "primitive") {
      body.innerHTML = `<p class="props-empty">选择图元以编辑几何坐标与样式。</p>`;
      return;
    }

    const kindLabel = document.createElement("p");
    kindLabel.className = "props-kind";
    kindLabel.textContent = `类型：${shape.kind}`;
    body.appendChild(kindLabel);

    appendGeometryEditor(shape);
    appendStyleFields(shape, body);
  }

  return { refresh };
}

export function isPrimitive(shape: Shape | null): shape is PrimitiveShape {
  return shape !== null && shape.layer === "primitive";
}
