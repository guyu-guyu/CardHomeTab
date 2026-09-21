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

/** 卡片拖拽专用的私有数据类型。 */
export const CARD_DRAG_TYPE = "application/x-card-home-tab-card";

/**
 * "这次 drag 是不是我们自己发起的"必须以 **drag 自身的** `dataTransfer` 类型标记为准，
 * 不能靠任何可变状态。
 *
 * 模块级变量尤其不行：`onDrop` → `moveCard` → `refreshHome` 会在拖拽还没结束时就把源卡片
 * 销毁掉（`disposeCards()`），源卡片上的 `dragend` 可能因此根本不触发，过期下标就留给了
 * 下一次外来拖拽——比如从系统里拖一个文件进页面，`getData` 读不到东西就回落到那个过期下标，
 * 于是 `onDrop` 真的被调用、仪表盘文件被改序。放在 `gridEl.dataset` 上也只对"源网格"可见，
 * 会挡掉跨首页视图（分屏、弹出窗口）的拖拽。
 *
 * `dragover` 阶段 `dataTransfer` 处于保护模式，`getData` 返回空串，但 **`types` 依然可读**，
 * 所以闸门查 `types`、取值放到 `drop` 里用 `getData`。
 */
const isCardDrag = (event: DragEvent): boolean =>
  event.dataTransfer?.types.includes(CARD_DRAG_TYPE) ?? false;

/**
 * 把 dragstart 载荷解析成"被拖卡片的起始下标"。
 *
 * 解析不出来就返回 `null`，调用方直接跳过——**不要**退回调用方自己的 `index`：
 * drop 事件落在目标卡片上，那张卡片闭包里的 `index` 就是它自己，拿它当 `from`
 * 会让 `target === from` 恒成立、`onDrop` 永不触发，正好退化成"拖了等于没拖"。
 */
export function resolveDragIndex(payload: string): number | null {
  const parsed = Number.parseInt(payload, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function enableCardDrag(args: DragArgs): () => void {
  const { cardEl, handleEl, onDrop, isEnabled } = args;
  // 不解构 `gridEl`：唯一用到它的地方是 `cardRects(args.gridEl)`，解构出来反而是未使用变量。
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
   * （或选区）拖拽会被当成卡片拖拽：卡片被加上 `is-dragging`，本卡下标被写进拖拽载荷，
   * 随后在别的卡片上松手就会真的调 `onDrop`、改写仪表盘文件。
   * 卡片是拖拽源时 `event.target` 就是 cardEl；链接是拖拽源时 target 是那个 `<a>`。
   *
   * **不要**改成 `cardEl.contains(event.target)`：链接正是 cardEl 的后代，那样等于把
   * 刚挡掉的链接拖拽又放回来。
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
    // 这条通道就是 dataTransfer 上的私有类型：它随这次 drag 生灭，不会像模块级变量那样
    // 因为「源卡片提前被销毁、dragend 没触发」而留下过期下标。
    if (event.dataTransfer) {
      event.dataTransfer.setData(CARD_DRAG_TYPE, String(args.index));
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (event: DragEvent): void => {
    if (!isEnabled() || !isCardDrag(event)) {
      return;
    }
    // 只为放行 drop；不做落点预览，所以不在这里写任何 dataset。
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent): void => {
    if (!isEnabled() || !isCardDrag(event)) {
      return;
    }
    event.preventDefault();
    const from = resolveDragIndex(event.dataTransfer?.getData(CARD_DRAG_TYPE) ?? "");
    if (from === null) {
      return;
    }
    let target = computeDropIndex(cardRects(args.gridEl), event.clientX, event.clientY);
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
