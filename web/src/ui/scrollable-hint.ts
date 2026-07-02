/** 单行提示：截断时悬停可滚轮横向滚动查看全文 */
export function bindScrollableHint(el: HTMLElement): void {
  const updateTruncation = (): void => {
    const truncated = el.scrollWidth > el.clientWidth + 1;
    el.classList.toggle("is-truncated", truncated);
    if (truncated) {
      el.title = el.textContent ?? "";
    } else {
      el.removeAttribute("title");
    }
  };

  const observer = new ResizeObserver(updateTruncation);
  observer.observe(el);

  const textObserver = new MutationObserver(updateTruncation);
  textObserver.observe(el, { childList: true, characterData: true, subtree: true });

  el.addEventListener("wheel", (event) => {
    if (el.scrollWidth <= el.clientWidth) return;
    event.preventDefault();
    el.scrollLeft += event.deltaY + event.deltaX;
  }, { passive: false });

  updateTruncation();
}
