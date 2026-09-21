export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function computeDropIndex(rects: Rect[], x: number, y: number): number {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!;
    if (y < rect.top) {
      return i;
    }
    if (y <= rect.bottom) {
      if (x < (rect.left + rect.right) / 2) {
        return i;
      }
      continue;
    }
  }
  return rects.length;
}

export interface DragArgs {
  gridEl: HTMLElement;
  cardEl: HTMLElement;
  handleEl: HTMLElement;
  index: number;
  onDrop: (from: number, to: number) => void;
  isEnabled: () => boolean;
}

function cardRects(gridEl: HTMLElement): Rect[] {
  // 用 Obsidian 的 `.instanceOf(HTMLElement)`（跨窗口安全的 instanceof 替身）而不是
  // `instanceof HTMLElement`：弹出窗口里的卡片属于另一个 window，原生 instanceof 会失配；
  // 且 obsidianmd/prefer-instanceof 是 --max-warnings 0 下的硬门禁，规则本身不可 disable。
  return Array.from(gridEl.children)
    .filter((child): child is HTMLElement => child.instanceOf(HTMLElement) && child.hasClass("home-card"))
    .map((card) => card.getBoundingClientRect());
}

export function enableCardDrag(args: DragArgs): () => void {
  const { gridEl, cardEl, handleEl, index, onDrop, isEnabled } = args;
  let dragging = false;

  const enableDraggable = (): void => {
    dragging = false;
    cardEl.setAttribute("draggable", "true");
  };
  const disableDraggable = (): void => {
    cardEl.removeAttribute("draggable");
  };

  const handleDragStart = (event: DragEvent): void => {
    if (!isEnabled()) {
      event.preventDefault();
      return;
    }
    dragging = true;
    cardEl.addClass("is-dragging");
    // 被拖卡片的下标必须另走一条通道：drop 事件落在指针下方的元素上，也就是「目标卡片」，
    // 那个卡片的闭包 index 是它自己。只信闭包的话，computeDropIndex 在目标卡片内部永远
    // 返回它自己的槽位，target === index 恒成立，onDrop 一次都不会触发（拖了等于没拖）。
    gridEl.dataset["draggingIndex"] = String(index);
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
    }
  };

  /** 优先读 dataTransfer（标准通道，计划里原本就写了却没读），读不到再退回网格上的备份：
   *  部分平台/情况下 drop 阶段的 getData 会返回空串。两者都没有才退回闭包 index。 */
  const draggedIndex = (event: DragEvent): number => {
    const payload = event.dataTransfer?.getData("text/plain") ?? "";
    const raw = payload.length > 0 ? payload : (gridEl.dataset["draggingIndex"] ?? "");
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? index : parsed;
  };

  const handleDragOver = (event: DragEvent): void => {
    if (!isEnabled()) {
      return;
    }
    // 只为放行落点而存在：不 preventDefault，浏览器就不允许 drop。
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent): void => {
    if (!isEnabled()) {
      return;
    }
    event.preventDefault();
    const from = draggedIndex(event);
    let target = computeDropIndex(cardRects(gridEl), event.clientX, event.clientY);
    if (target > from) {
      target -= 1;
    }
    if (target !== from) {
      onDrop(from, target);
    }
  };

  const handleDragEnd = (): void => {
    dragging = false;
    cardEl.removeClass("is-dragging");
    delete gridEl.dataset["draggingIndex"];
    disableDraggable();
  };

  /** 只为"按下了把手但并没有真的开始拖"这种收尾而存在。
   *  少了它，draggable 会一直挂着，直到下一次 dragend 才被清掉——
   *  期间用户在卡片正文里划选文字会变成拖卡片。 */
  const resetIfNotDragging = (): void => {
    if (!dragging) {
      disableDraggable();
    }
  };

  handleEl.addEventListener("pointerdown", enableDraggable);
  cardEl.addEventListener("dragstart", handleDragStart);
  cardEl.addEventListener("dragover", handleDragOver);
  cardEl.addEventListener("drop", handleDrop);
  cardEl.addEventListener("dragend", handleDragEnd);
  // 挂在把手自己的 document 上而不是把手上：手指可能松在把手外面。
  // 用 handleEl.ownerDocument 而不是全局 document：弹出窗口里的元素属于另一个 window，
  // 全局 document 根本收不到那边的事件；元素自身的 ownerDocument 则恒存在。
  const ownerDocument = handleEl.ownerDocument;
  ownerDocument.addEventListener("pointerup", resetIfNotDragging);
  ownerDocument.addEventListener("pointercancel", resetIfNotDragging);

  return () => {
    handleEl.removeEventListener("pointerdown", enableDraggable);
    cardEl.removeEventListener("dragstart", handleDragStart);
    cardEl.removeEventListener("dragover", handleDragOver);
    cardEl.removeEventListener("drop", handleDrop);
    cardEl.removeEventListener("dragend", handleDragEnd);
    ownerDocument.removeEventListener("pointerup", resetIfNotDragging);
    ownerDocument.removeEventListener("pointercancel", resetIfNotDragging);
  };
}
