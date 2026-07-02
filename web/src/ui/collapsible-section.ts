export type CollapsibleSection = {
  root: HTMLElement;
  body: HTMLElement;
  setTitle: (text: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  isCollapsed: () => boolean;
};

export function createCollapsibleSection(
  title: string,
  opts?: { defaultCollapsed?: boolean },
): CollapsibleSection {
  const root = document.createElement("div");
  root.className = "collapsible-section";
  if (opts?.defaultCollapsed) root.classList.add("collapsed");

  const header = document.createElement("button");
  header.type = "button";
  header.className = "collapsible-section-header";

  const chevron = document.createElement("span");
  chevron.className = "collapsible-section-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▼";

  const titleEl = document.createElement("span");
  titleEl.className = "collapsible-section-title";
  titleEl.textContent = title;

  header.append(chevron, titleEl);
  header.addEventListener("click", () => {
    root.classList.toggle("collapsed");
  });

  const body = document.createElement("div");
  body.className = "collapsible-section-body";

  root.append(header, body);

  return {
    root,
    body,
    setTitle: (text) => {
      titleEl.textContent = text;
    },
    setCollapsed: (collapsed) => {
      root.classList.toggle("collapsed", collapsed);
    },
    isCollapsed: () => root.classList.contains("collapsed"),
  };
}
