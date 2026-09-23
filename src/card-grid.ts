import { effectiveCol, effectiveColumns, effectiveSpan, type LayoutCard } from "./column-layout";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DragArgs {
  cardEl: HTMLElement;
  handleEl: HTMLElement;
  index: number;
  isEnabled: () => boolean;
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
  const { cardEl, handleEl, isEnabled } = args;
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
    cardEl.removeEventListener("dragend", handleDragEnd);
    ownerDocument.removeEventListener("pointerup", resetIfNotDragging);
    ownerDocument.removeEventListener("pointercancel", resetIfNotDragging);
  };
}


// ===== 落点判定与指示线 =====
//
// 这一段整体挂在**网格**上，不再按卡片挂。两个原因：
//   1. 卡片之间、短列底部、空列那些区域没有任何卡片，按卡片挂 `dragover` 就不会
//      `preventDefault`，那些位置根本触发不了 drop——而列布局下"把卡片拖到某列最下面"
//      恰恰是最常用的操作。
//   2. 指示线整个网格只该有一条，按卡片挂会各画一条。

export interface GridDropArgs {
  gridEl: HTMLElement;
  /** 本次渲染的卡片快照，顺序与笔记一致 */
  cards: readonly LayoutCard[];
  configuredColumns: number;
  /** 第三个参数是**投放当时**的生效列数：落盘侧不必再自己查 DOM 重算，避免两处分歧 */
  onDrop: (from: number, target: DropTarget, columns: number) => void;
}

/** 落点：目标列（1-based）+ 在该列内的插入位置（0..该列卡片数） */
export interface DropTarget {
  col: number;
  indexInCol: number;
}

/** 指示线的位置，坐标相对网格左上角。列布局下它是一条横线。 */
export interface HLinePlacement {
  left: number;
  top: number;
  width: number;
}

/**
 * 列的横向区间（相对网格左上角）。
 *
 * 列宽由 `repeat(N, minmax(0, 1fr))` 等分，所以能纯算出来，不必去量某张卡片——
 * 空列没有卡片可量，靠卡片反推会得不到它的位置。
 */
export function columnBand(
  gridWidth: number,
  columns: number,
  gap: number,
  col: number,
): { left: number; width: number } {
  const total = Number.isInteger(columns) && columns >= 1 ? columns : 1;
  const safeGap = Number.isFinite(gap) && gap > 0 ? gap : 0;
  const safeWidth = Number.isFinite(gridWidth) && gridWidth > 0 ? gridWidth : 0;
  if (safeWidth === 0) {
    // 网格还没布局。此时别按 gap 算出一个幻影偏移，整体归零更清楚地表达"这里什么都没有"。
    return { left: 0, width: 0 };
  }
  const width = Math.max((safeWidth - safeGap * (total - 1)) / total, 0);
  const index = Math.min(Math.max(col, 1), total) - 1;
  return { left: index * (width + safeGap), width };
}

/**
 * 横坐标落在哪一列。
 *
 * 按等分切片而不是按 `columnBand` 的精确区间判断：精确区间之间还夹着 gap，那几个像素会
 * 变成"哪一列都不是"的死区，拖到列缝上就没有落点。等分切片让每个 x 都归属某一列。
 */
export function columnAt(gridWidth: number, columns: number, offsetX: number): number {
  const total = Number.isInteger(columns) && columns >= 1 ? columns : 1;
  const safeWidth = Number.isFinite(gridWidth) && gridWidth > 0 ? gridWidth : 0;
  if (safeWidth === 0) {
    return 1;
  }
  const slice = safeWidth / total;
  const index = Math.floor((Number.isFinite(offsetX) ? offsetX : 0) / slice);
  return Math.min(Math.max(index, 0), total - 1) + 1;
}

/** 一张卡片在网格里占的列范围（列号与跨列数都已钳制过） */
export interface PlacedCard {
  col: number;
  span: number;
}

/**
 * 某一列的成员在笔记里的下标，升序。
 *
 * 宽卡片要算作它**覆盖的每一列**的成员，不能只算起始列。只算起始列的话，一张
 * `col=1; span=2` 的卡片在列 2 里就是"不存在"的：想把别的卡片拖到它上方时，落点会算成
 * "插到列 2 第一张单列卡之前"，而那个位置在笔记里恰好排在宽卡片**之后**，于是新卡片又被
 * 排到宽卡片下面——拖上去就是不动。
 */
export function columnMembers(placed: readonly PlacedCard[], col: number): number[] {
  const members: number[] = [];
  for (const [index, card] of placed.entries()) {
    if (col >= card.col && col <= card.col + card.span - 1) {
      members.push(index);
    }
  }
  return members;
}

/**
 * 坐标 → 落点。
 *
 * 列内插入位置用卡片的**垂直中点**判断：指针在上半部分就插到它上方，下半部分就插到它下方。
 * 这正是横线指示线要表达的语义。
 */
export function computeColumnDrop(
  rects: readonly Rect[],
  placed: readonly PlacedCard[],
  gridRect: Rect,
  columns: number,
  x: number,
  y: number,
): DropTarget {
  const gridWidth = gridRect.right - gridRect.left;
  const col = columnAt(gridWidth, columns, x - gridRect.left);
  const members = columnMembers(placed, col);
  for (const [position, noteIndex] of members.entries()) {
    const rect = rects[noteIndex];
    if (!rect) {
      continue;
    }
    if (y < (rect.top + rect.bottom) / 2) {
      return { col, indexInCol: position };
    }
  }
  return { col, indexInCol: members.length };
}

/**
 * 落点 → **移除之前**的笔记插入下标。
 *
 * `edit.ts` 的 `moveCard(from, to)` 里 `to` 是**移除之后**的下标，所以调用方拿到这里的
 * 返回值后还要做 `to = raw > from ? raw - 1 : raw` 的补偿。两者别混。
 */
export function dropTargetToNoteIndex(
  placed: readonly PlacedCard[],
  target: DropTarget,
): number {
  const members = columnMembers(placed, target.col);
  if (target.indexInCol < members.length) {
    return members[target.indexInCol]!;
  }
  if (members.length > 0) {
    // 插到该列末尾：紧跟该列最后一张之后
    return members[members.length - 1]! + 1;
  }
  // 空列：笔记顺序无所谓（列归属才是决定位置的东西），追加到末尾即可
  return placed.length;
}

/**
 * 横线贴在插入点**上方**那张卡片的下边界；插到列首时贴第一张的上边界；空列贴网格顶部。
 *
 * 为什么不贴"下方那张卡片的上边界"（更直觉的写法）：列底部有宽卡片时，它要等所跨的各列
 * 都腾出位置才能落下，于是本列会空出很长一段。此时若把线画在下方那张卡的上边界，线就跑到
 * 空白的另一端、甚至屏幕外，用户完全看不到自己拖到哪了。贴上方那张的下边界则永远紧挨着
 * 刚刚越过的那张卡片。
 *
 * 顺带把"插到列尾"统一进同一条规则——它本来就是贴最后一张的下边界。
 */
export function horizontalIndicator(
  rects: readonly Rect[],
  placed: readonly PlacedCard[],
  gridRect: Rect,
  columns: number,
  gap: number,
  target: DropTarget,
): HLinePlacement {
  const band = columnBand(gridRect.right - gridRect.left, columns, gap, target.col);
  const members = columnMembers(placed, target.col);
  let top = 0;
  if (members.length === 0) {
    top = 0;
  } else if (target.indexInCol <= 0) {
    top = (rects[members[0]!]?.top ?? gridRect.top) - gridRect.top;
  } else {
    const above = members[Math.min(target.indexInCol, members.length) - 1]!;
    top = (rects[above]?.bottom ?? gridRect.top) - gridRect.top;
  }
  return { left: band.left, top, width: band.width };
}

/**
 * 给网格接上落点判定、投放与指示线，返回还原函数。整个网格只需一份。
 *
 * `cards` 是本次渲染的卡片快照（顺序 = 笔记顺序），列号在拖拽时才按当时的生效列数算出来：
 * 窗口宽度会变，窄屏下所有卡片都归第 1 列，不能在渲染时算死。
 */
export function enableGridDrop(args: GridDropArgs): () => void {
  const { gridEl, cards, configuredColumns, onDrop } = args;
  let line: HTMLElement | null = null;

  const hide = (): void => {
    line?.remove();
    line = null;
  };

  const show = (placement: HLinePlacement): void => {
    line ??= gridEl.createDiv({ cls: "home-card-drop-indicator" });
    line.style.left = `${placement.left}px`;
    line.style.top = `${placement.top}px`;
    line.style.width = `${placement.width}px`;
  };

  const win = gridEl.ownerDocument.defaultView;
  const gapOf = (): number =>
    win ? Number.parseFloat(win.getComputedStyle(gridEl).columnGap) || 0 : 0;

  /** 当前生效的列数与每张卡片的实际列号 */
  const snapshot = (): { columns: number; placed: PlacedCard[]; rects: Rect[]; gridRect: Rect } => {
    const columns = effectiveColumns(gridEl.clientWidth, configuredColumns);
    return {
      columns,
      placed: cards.map((card, index) => ({
        col: effectiveCol(card.col, index, columns, card.span),
        span: effectiveSpan(card.span, columns),
      })),
      rects: cards.map((card) => card.el.getBoundingClientRect()),
      gridRect: gridEl.getBoundingClientRect(),
    };
  };

  const handleDragOver = (event: DragEvent): void => {
    if (!isCardDrag(event)) {
      hide();
      return;
    }
    // 必须在网格层放行：卡片之间、短列底部、空列都没有卡片，只在卡片上 preventDefault
    // 的话那些位置根本收不到 drop，而"拖到某列最下面"恰恰是列布局最常用的操作。
    event.preventDefault();
    const { columns, placed, rects, gridRect } = snapshot();
    const target = computeColumnDrop(rects, placed, gridRect, columns, event.clientX, event.clientY);
    show(horizontalIndicator(rects, placed, gridRect, columns, gapOf(), target));
  };

  const handleDrop = (event: DragEvent): void => {
    hide();
    if (!isCardDrag(event)) {
      return;
    }
    event.preventDefault();
    const from = resolveDragIndex(event.dataTransfer?.getData(CARD_DRAG_TYPE) ?? "");
    if (from === null || from < 0 || from >= cards.length) {
      return;
    }
    const { columns, placed, rects, gridRect } = snapshot();
    const target = computeColumnDrop(rects, placed, gridRect, columns, event.clientX, event.clientY);
    // 这里**不做**"目标等于原位就不调用"的早退：跨列拖动可能完全不改变笔记顺序
    // （比如把某列唯一的卡片拖到另一个空列），早退会让这种拖拽静默失效。
    // 该不该写列、该不该移动，由落盘侧各自判断。
    onDrop(from, target, columns);
  };

  /**
   * 指针移出网格后 dragover 不再触发，最后的状态会留在屏幕上，所以要自己收尾。
   * 用坐标判断是否真的离开了网格，而不是看 relatedTarget：在子元素之间移动也会触发
   * dragleave，看 relatedTarget 还得额外做包含判断。
   */
  const handleDragLeave = (event: DragEvent): void => {
    const rect = gridEl.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      hide();
    }
  };

  gridEl.addEventListener("dragover", handleDragOver);
  gridEl.addEventListener("dragleave", handleDragLeave);
  gridEl.addEventListener("drop", handleDrop);
  // dragend 并不可靠——onDrop → moveCard → refreshHome 会在拖拽结束前销毁源卡片，它身上的
  // dragend 可能根本不触发。那条路径上整个网格会被 root.empty() 丢掉，指示线跟着消失；
  // 而拖拽被取消（Esc、拖出窗口松手）时就靠这里的 dragend。
  gridEl.addEventListener("dragend", hide);

  return () => {
    gridEl.removeEventListener("dragover", handleDragOver);
    gridEl.removeEventListener("dragleave", handleDragLeave);
    gridEl.removeEventListener("drop", handleDrop);
    gridEl.removeEventListener("dragend", hide);
    hide();
  };
}
