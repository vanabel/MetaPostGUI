const NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

/** 右侧面板布局：展开时显示侧栏块 + 右指箭头（收起）；收起时主区加宽 + 左指箭头（展开） */
export function renderSidebarToggleIcon(hidden: boolean): SVGSVGElement {
  const svg = svgEl("svg", {
    viewBox: "0 0 24 24",
    width: "18",
    height: "18",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "sidebar-toggle-icon",
  });

  const main = svgEl("rect", {
    x: "3",
    y: "5",
    width: hidden ? "15" : "10",
    height: "14",
    rx: "2",
    class: "sidebar-toggle-main",
  });
  main.setAttribute("fill", "currentColor");
  main.setAttribute("stroke", "none");
  main.setAttribute("opacity", hidden ? "0.22" : "0.28");
  svg.appendChild(main);

  if (!hidden) {
    const panel = svgEl("rect", {
      x: "15",
      y: "5",
      width: "6",
      height: "14",
      rx: "2",
      class: "sidebar-toggle-pane-right",
    });
    panel.setAttribute("fill", "currentColor");
    panel.setAttribute("stroke", "none");
    panel.setAttribute("opacity", "0.55");
    svg.appendChild(panel);

    const divider = svgEl("line", {
      x1: "14.5",
      y1: "5",
      x2: "14.5",
      y2: "19",
      class: "sidebar-toggle-divider",
    });
    divider.setAttribute("opacity", "0.45");
    svg.appendChild(divider);
  } else {
    const ghost = svgEl("rect", {
      x: "19",
      y: "5",
      width: "2",
      height: "14",
      rx: "1",
      class: "sidebar-toggle-pane-ghost",
    });
    ghost.setAttribute("stroke-dasharray", "2 2");
    ghost.setAttribute("opacity", "0.45");
    svg.appendChild(ghost);
  }

  const arrow = svgEl("path", {
    d: hidden ? "M21 12H17M19 10.5L21 12L19 13.5" : "M13 12H9M11 10.5L9 12L11 13.5",
    class: "sidebar-toggle-arrow",
  });
  svg.appendChild(arrow);

  return svg;
}

export function setSidebarToggleIcon(button: HTMLButtonElement, hidden: boolean): void {
  button.replaceChildren(renderSidebarToggleIcon(hidden));
}
