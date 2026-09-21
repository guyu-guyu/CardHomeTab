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

/**
 * 把 dragstart 载荷与网格上的备份下标解析成"被拖卡片的起始下标"。
 *
 * 两路都拿不到就返回 `null`——**不要**退回调用方自己的 `index`：drop 事件落在目标卡片上，
 * 那张卡片闭包里的 `index` 就是它自己，拿它当 `from` 会让 `target === from` 恒成立、
 * `onDrop` 永不触发，正好退化成"拖了等于没拖"那个静默失效。
 */
export function resolveDragIndex(payload: string, marker: string | undefined): number | null {
  const raw = payload.length > 0 ? payload : (marker ?? "");
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function enableCardDrag(args: DragArgs): () => void {
  const { gridEl, cardEl, handleEl, onDrop, isEnabled } = args;
  let dragging = false;

  const enableDraggable = (): void => {
    dragging = false;
    cardEl.setAttribute("draggable", "true");
  };
  const disableDraggable = (): void => {
    cardEl.removeAttribute("draggable");
  };

  /**
   * 只有"卡片自己就是拖拽源"才算卡片拖拽。
   *
   * 卡片正文里的链接本身可拖，它的 `dragstart` 会冒泡到卡片上；不挡住的话，一次链接
   * （或选区）拖拽会被当成卡片拖拽：卡片被加上 `is-dragging`，本卡下标被写进
   * `gridEl.dataset`，随后在别的卡片上松手就会真的调 `onDrop`、改写仪表盘文件。
   * 卡片是拖拽源时 `event.target` 就是 cardEl；链接是拖拽源时 target 是那个 `<a>`。
   */
  const handleDragStart = (event: DragEvent): void => {
    if (!isEnabled() || event.target !== cardEl) {
      return;
    }
    dragging = true;
    cardEl.addClass("is-dragging");
    // 被拖卡片的下标必须另走一条通道：drop 事件落在指针下方的元素上，也就是「目标卡片」，
    // 那个卡片的闭包 index 是它自己。只信闭包的话，computeDropIndex 在目标卡片内部永远
    // 返回它自己的槽位，target === index 恒成立，onDrop 一次都不会触发（拖了等于没拖）。
    gridEl.dataset["draggingIndex"] = String(args.index);
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", String(args.index));
      event.dataTransfer.effectAllowed = "move";
    }
  };

  /**
   * 网格上有"拖拽中"的标记，是"这次 drag 是不是我们自己发起"的**共享**信号。
   *
   * 不能用各卡闭包里的 `dragging`：drop 落在目标卡片上，那张卡的 `dragging` 必然为 false。
   * 同时这也让 `dragover` 只为我们自己的拖拽 `preventDefault()`——否则从系统里拖进来的
   * 文件会被卡片当成可落点吞掉。
   */
  const isCardDrag = (): boolean => gridEl.dataset["draggingIndex"] !== undefined;

  const handleDragOver = (event: DragEvent): void => {
    if (!isEnabled() || !isCardDrag()) {
      return;
    }
    // 只为放行 drop；不做落点预览，所以不在这里写任何 dataset。
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent): void => {
    if (!isEnabled() || !isCardDrag()) {
      return;
    }
    event.preventDefault();
    const from = resolveDragIndex(
      event.dataTransfer?.getData("text/plain") ?? "",
      gridEl.dataset["draggingIndex"],
    );
    if (from === null) {
      return;
    }
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
