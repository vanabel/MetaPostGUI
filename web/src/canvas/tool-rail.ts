import {
  TOOL_GROUPS,
  TOOL_HINTS,
  TOOL_ICONS,
  TOOL_LABELS,
  TOOL_ORDER,
  isToolGroup,
  toolsInGroup,
  type DrawTool,
  type ToolGroupId,
} from "./tools";

export type ToolRailOptions = {
  initialTool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
};

export type ToolRailHandle = {
  root: HTMLElement;
  setActiveTool: (tool: DrawTool) => void;
  getGroupVariant: (group: ToolGroupId) => DrawTool;
};

type OpenMenuState = {
  menu: HTMLElement;
  host: HTMLElement;
  anchor: HTMLElement;
  groupId: ToolGroupId;
};

const HOLD_MS = 380;

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

function setGroupButtonIcon(btn: HTMLButtonElement, tool: DrawTool): void {
  const icon = btn.querySelector(".tool-group-icon");
  if (icon) icon.textContent = TOOL_ICONS[tool];
  btn.title = `${TOOL_LABELS[tool]} — ${TOOL_HINTS[tool]}（按住弹出子工具）`;
}

export function buildToolRail(opts: ToolRailOptions): ToolRailHandle {
  const root = el("div", "tool-rail");
  const groupVariant: Record<ToolGroupId, DrawTool> = {
    circle: "circle",
    curve: "mpath",
  };
  const menuItems = new Map<ToolGroupId, HTMLButtonElement[]>();
  const groupMenus = new Map<ToolGroupId, HTMLElement>();
  let openMenu: OpenMenuState | null = null;

  const closeMenu = (): void => {
    if (!openMenu) return;
    const { menu, host, anchor } = openMenu;
    menu.classList.remove("open");
    menu.style.display = "";
    menu.style.position = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.zIndex = "";
    host.appendChild(menu);
    anchor.querySelector(".tool-group-btn")?.classList.remove("menu-open", "pressing");
    openMenu = null;
  };

  const positionMenu = (menu: HTMLElement, anchor: HTMLElement): void => {
    const rect = anchor.getBoundingClientRect();
    const gap = 6;
    let left = rect.right + gap;
    let top = rect.top;
    menu.style.position = "fixed";
    menu.style.zIndex = "2000";
    menu.style.display = "flex";
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth - 8) {
      left = Math.max(8, rect.left - menuRect.width - gap);
      menu.style.left = `${left}px`;
    }
    if (menuRect.bottom > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - menuRect.height - 8);
      menu.style.top = `${top}px`;
    }
  };

  const refreshMenuHighlights = (): void => {
    for (const [gid, items] of menuItems) {
      const active = groupVariant[gid];
      for (const item of items) {
        item.classList.toggle("active", item.dataset.tool === active);
      }
    }
  };

  const selectGroupTool = (groupId: ToolGroupId, tool: DrawTool): void => {
    groupVariant[groupId] = tool;
    const btn = root.querySelector<HTMLButtonElement>(
      `.tool-group[data-group="${groupId}"] .tool-group-btn`,
    );
    if (btn) setGroupButtonIcon(btn, tool);
    closeMenu();
    activateTool(tool);
  };

  const openGroupMenu = (groupId: ToolGroupId, anchor: HTMLElement): void => {
    const menu = groupMenus.get(groupId);
    const host = anchor.querySelector(".tool-group-menu-host");
    if (!menu || !host) return;
    closeMenu();
    document.body.appendChild(menu);
    menu.classList.add("open");
    positionMenu(menu, anchor);
    openMenu = { menu, host: host as HTMLElement, anchor, groupId };
    refreshMenuHighlights();
  };

  const activateTool = (tool: DrawTool): void => {
    for (const gid of Object.keys(TOOL_GROUPS) as ToolGroupId[]) {
      if (toolsInGroup(gid).includes(tool)) {
        groupVariant[gid] = tool;
      }
    }
    root.querySelectorAll(".tool-rail-btn[data-tool]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-tool") === tool);
    });
    root.querySelectorAll(".tool-group").forEach((g) => {
      const gid = g.getAttribute("data-group") as ToolGroupId;
      const inGroup = toolsInGroup(gid).includes(tool);
      g.classList.toggle("active", inGroup);
      const main = g.querySelector<HTMLButtonElement>(".tool-group-btn");
      if (inGroup && main) setGroupButtonIcon(main, tool);
    });
    refreshMenuHighlights();
    opts.onToolChange(tool);
  };

  const bindSimpleTool = (entry: DrawTool): void => {
    const btn = el("button", "tool-rail-btn", TOOL_ICONS[entry]);
    btn.type = "button";
    btn.title = `${TOOL_LABELS[entry]} — ${TOOL_HINTS[entry]}`;
    btn.dataset.tool = entry;
    btn.addEventListener("click", () => {
      closeMenu();
      activateTool(entry);
    });
    if (entry === opts.initialTool) btn.classList.add("active");
    root.appendChild(btn);
  };

  const bindToolGroup = (groupId: ToolGroupId): void => {
    const meta = TOOL_GROUPS[groupId];
    const wrap = el("div", "tool-group");
    wrap.dataset.group = groupId;

    const variant = groupVariant[groupId];
    const main = el("button", "tool-rail-btn tool-group-btn");
    main.type = "button";
    const icon = el("span", "tool-group-icon", TOOL_ICONS[variant]);
    const caret = el("span", "tool-group-caret-mark", "◢");
    caret.setAttribute("aria-hidden", "true");
    main.append(icon, caret);
    setGroupButtonIcon(main, variant);

    const menuHost = el("div", "tool-group-menu-host");
    const menu = el("div", "tool-group-menu");
    const items: HTMLButtonElement[] = [];

    for (const tool of meta.tools) {
      const item = el("button", "tool-group-item") as HTMLButtonElement;
      item.type = "button";
      item.dataset.tool = tool;
      item.innerHTML = `<span class="tool-group-item-icon">${TOOL_ICONS[tool]}</span><span class="tool-group-item-label">${TOOL_LABELS[tool]}</span>`;
      item.title = TOOL_HINTS[tool];
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectGroupTool(groupId, tool);
      });
      menu.appendChild(item);
      items.push(item);
    }
    menuItems.set(groupId, items);
    groupMenus.set(groupId, menu);
    menuHost.appendChild(menu);

    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let openedByHold = false;
    let hoverItem: HTMLButtonElement | null = null;

    const clearHoldTimer = (): void => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const clearHoverPreview = (): void => {
      hoverItem?.classList.remove("hover-preview");
      hoverItem = null;
    };

    const pickItemAt = (clientX: number, clientY: number): HTMLButtonElement | null => {
      const hit = document.elementFromPoint(clientX, clientY);
      return hit?.closest(".tool-group-item") as HTMLButtonElement | null;
    };

    const onSessionPointerMove = (e: PointerEvent): void => {
      if (!openedByHold || openMenu?.groupId !== groupId) return;
      const item = pickItemAt(e.clientX, e.clientY);
      if (item === hoverItem) return;
      clearHoverPreview();
      hoverItem = item;
      hoverItem?.classList.add("hover-preview");
    };

    const endPressSession = (e: PointerEvent): void => {
      document.removeEventListener("pointermove", onSessionPointerMove);
      document.removeEventListener("pointerup", endPressSession);
      document.removeEventListener("pointercancel", endPressSession);
      clearHoldTimer();
      main.classList.remove("pressing");
      main.releasePointerCapture(e.pointerId);

      if (openedByHold) {
        const item =
          hoverItem ?? pickItemAt(e.clientX, e.clientY);
        clearHoverPreview();
        if (item?.dataset.tool) {
          selectGroupTool(groupId, item.dataset.tool as DrawTool);
        } else if (openMenu?.groupId === groupId) {
          closeMenu();
        }
        openedByHold = false;
        return;
      }

      activateTool(groupVariant[groupId]);
    };

    main.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      openedByHold = false;
      clearHoverPreview();
      main.classList.add("pressing");
      main.setPointerCapture(e.pointerId);

      document.addEventListener("pointermove", onSessionPointerMove);
      document.addEventListener("pointerup", endPressSession);
      document.addEventListener("pointercancel", endPressSession);

      holdTimer = setTimeout(() => {
        holdTimer = null;
        openedByHold = true;
        main.classList.add("menu-open");
        try {
          main.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        openGroupMenu(groupId, wrap);
      }, HOLD_MS);
    });

    main.addEventListener("contextmenu", (e) => e.preventDefault());

    wrap.append(main, menuHost);
    if (meta.tools.includes(opts.initialTool)) {
      wrap.classList.add("active");
      groupVariant[groupId] = opts.initialTool;
      setGroupButtonIcon(main, opts.initialTool);
    }
    root.appendChild(wrap);
  };

  for (const entry of TOOL_ORDER) {
    if (isToolGroup(entry)) bindToolGroup(entry.group);
    else bindSimpleTool(entry);
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!openMenu) return;
      const target = e.target as Node;
      if (openMenu.menu.contains(target)) return;
      if (openMenu.anchor.contains(target)) return;
      closeMenu();
    },
    true,
  );

  window.addEventListener("resize", () => closeMenu());
  root.addEventListener("scroll", () => closeMenu(), true);

  refreshMenuHighlights();

  return {
    root,
    setActiveTool: activateTool,
    getGroupVariant: (group) => groupVariant[group],
  };
}
