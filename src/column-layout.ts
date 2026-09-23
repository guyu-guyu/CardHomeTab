/**
 * 以列为单位的卡片布局。
 *
 * 每张卡片显式归属某一列，列内自上而下排列，一般不会跑到别的列——这样拖动一张卡片时，
 * 别的卡片不会跟着重排，布局是可预测的。
 *
 * ## 为什么行位置也要自己算，不能交给 CSS
 *
 * 直觉上「写死 grid-column、行交给自动放置」就够了，但按 CSS Grid 规范 §8.5 推演过：
 * sparse 自动放置的**行游标跨列共享且只前进不回退**。于是列 1 的一张高卡片会把之后
 * 其他列的卡片一起推下去——列 2 明明从第 30 行就空着，卡片却被放到第 80 行，留出大片空白。
 * `grid-auto-flow: row dense` 会为每个定列项把行游标重置到第 1 行（能贴紧），但遇到
 * `span=2` 的宽卡片时，又会让笔记里靠后的卡片插到它上方，视觉顺序与笔记顺序不符。
 *
 * 所以 `grid-column` 与 `grid-row` 全部由这里算出来写死，完全不依赖自动放置。
 */

/**
 * `grid-auto-rows` 的粒度。越小越精确，代价是隐式行轨道变多；
 * 4px 时一张卡片底部最多多出 3px 余量，视觉上看不出来。
 */
export const ROW_UNIT = 4;

/** 窄于此宽度收成单列。与之前 styles.css 里 @media 的阈值保持一致。 */
export const NARROW_WIDTH = 900;

export interface LayoutInput {
  /** 卡片所在列（1-based）；`0` 表示未指定，按笔记顺序轮转回退 */
  col: number;
  /** 跨列数，来自 `%%card:` 的 `span` */
  span: number;
  /** 实测高度（px） */
  height: number;
}

export interface LayoutSlot {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

/**
 * 算出一张卡片该跨多少个细行。
 *
 * 行间距不是靠 `row-gap` 留的（那会让可用高度变成 K*unit + (K-1)*gap，粒度被 gap 撑得很粗），
 * 而是靠"多占几行"来留，所以 `row-gap` 必须是 0，这里把间距加进高度一起换算。
 */
export function rowSpan(height: number, rowUnit: number, gap: number): number {
  if (!Number.isFinite(height) || height <= 0 || rowUnit <= 0) {
    return 1;
  }
  const reserved = height + (Number.isFinite(gap) && gap > 0 ? gap : 0);
  return Math.max(1, Math.ceil(reserved / rowUnit));
}

/**
 * 生效的列数。
 *
 * 由 JS 单点决定而不是靠 CSS 媒体查询：布局要知道究竟有几列才能算列号，而读
 * `getComputedStyle().gridTemplateColumns` 并不可靠——容器 `display:none` 或脱离文档时
 * 它返回的是未解析的 `repeat(3, minmax(0, 1fr))`，按空白切会数出 3 个 token，2 列时也是 3，
 * 错得毫无征兆。
 *
 * 宽度为 0（还没布局、或视图不可见）时按配置值处理，不要缩成单列：那会让首次渲染
 * 先排成一列、拿到宽度后再跳一次。
 */
export function effectiveColumns(gridWidth: number, configured: number): number {
  const total = Number.isInteger(configured) && configured >= 1 ? configured : 1;
  if (!Number.isFinite(gridWidth) || gridWidth <= 0) {
    return total;
  }
  return gridWidth < NARROW_WIDTH ? 1 : total;
}

/**
 * 卡片实际落在哪一列。
 *
 * `col <= 0`（未指定）时按笔记顺序轮转：第 1 张→列 1、第 2 张→列 2……这样存量笔记不写
 * 任何东西也能得到一个合理的初始分布。
 *
 * 注意轮转只适合"还没固化"的过渡期：`index` 会随笔记顺序变化，所以一旦用户拖动过卡片，
 * 调用方应当把当时的实际列号写回文件（固化），否则每次拖动都会让其他卡片跟着跳列。
 *
 * 末尾对 `span` 做联合钳制：3 列网格里 `col=3` 且 `span=2` 的卡片若不钳，会撑出隐式第 4 列。
 */
export function effectiveCol(col: number, index: number, columns: number, span: number): number {
  const total = Number.isInteger(columns) && columns >= 1 ? columns : 1;
  const colSpan = effectiveSpan(span, total);
  const raw =
    Number.isInteger(col) && col >= 1
      ? col
      : (((Number.isInteger(index) && index >= 0 ? index : 0) % total) + 1);
  const maxStart = total - colSpan + 1;
  return Math.min(Math.max(raw, 1), Math.max(maxStart, 1));
}

/** 跨列数钳到 [1, columns]：宽卡片不能宽过整个网格 */
export function effectiveSpan(span: number, columns: number): number {
  const total = Number.isInteger(columns) && columns >= 1 ? columns : 1;
  const raw = Number.isInteger(span) && span >= 1 ? span : 1;
  return Math.min(raw, total);
}

/**
 * 按笔记顺序逐张放置，每张卡片落在它所属列当前的最低可用位置。
 *
 * 宽卡片（`span > 1`）取它所跨各列中最低的那个可用位置，放下之后把这几列一起推到它下方——
 * 这是宽卡片唯一合理的语义，代价是它会把所跨的列在该处耦合起来。
 */
export function computeColumnLayout(
  items: readonly LayoutInput[],
  columns: number,
  rowUnit: number,
  gap: number,
): LayoutSlot[] {
  const total = Number.isInteger(columns) && columns >= 1 ? columns : 1;
  // colFree[i] = 第 i 列下一个可用的细行号（1-based）
  const colFree = new Array<number>(total).fill(1);
  const slots: LayoutSlot[] = [];

  for (const [index, item] of items.entries()) {
    const colSpan = effectiveSpan(item.span, total);
    const colStart = effectiveCol(item.col, index, total, item.span);
    const first = colStart - 1;
    const last = first + colSpan - 1;

    let rowStart = 1;
    for (let i = first; i <= last; i++) {
      rowStart = Math.max(rowStart, colFree[i] ?? 1);
    }
    const span = rowSpan(item.height, rowUnit, gap);

    slots.push({ colStart, colSpan, rowStart, rowSpan: span });
    for (let i = first; i <= last; i++) {
      colFree[i] = rowStart + span;
    }
  }
  return slots;
}

/** 布局所需的一张卡片：DOM 元素 + 它的列归属意愿 */
export interface LayoutCard {
  el: HTMLElement;
  /** `%%card:` 里的 col，0 表示未指定 */
  col: number;
  span: number;
}

/**
 * 判断列数时该看的宽度：网格**父容器**的宽度，而不是网格自身的。
 *
 * 「限制栏宽」给网格加了 `max-width`，网格自身的 `clientWidth` 因此等于 `min(可用宽, 上限)`。
 * 拿它去判窄屏的话，把栏宽设成小于 `NARROW_WIDTH` 的值就会让多列直接塌成单列——这个设置
 * 等于自己把自己废掉。收成单列是因为**面板空间不够**，而限制栏宽是用户的明确选择，
 * 两者不能混为一谈。
 *
 * 取不到父元素时退回网格自身的宽度：那种情况下网格没有被谁约束，两者本就相等。
 */
export function availableWidth(gridEl: HTMLElement): number {
  const parent = gridEl.parentElement;
  return parent ? parent.clientWidth : gridEl.clientWidth;
}

/**
 * 把网格置成列布局的**最终几何**：列模板、细行轨道、以及把 `row-gap` 归零的开闸类。返回生效列数。
 *
 * 之所以要能在卡片渲染**之前**单独调用：`render()` 的卡片循环里每张卡片都要 await（读片段、
 * 渲染正文），卡片是逐张可见地加进网格的。若此时网格还没有列模板，它就是隐式单列、每张卡片
 * 占满宽度，循环结束才一次性吸附成 N 列——这正是"拖动后闪烁、宽卡片短暂占满整宽"的来源。
 *
 * 必须与 `placeCards` **配对**使用：
 *   - 只写列模板而不加类与细行轨道，过渡态是"auto 行 + 正常 row-gap"，最终态是"细行 + row-gap:0"，
 *     末尾仍会有一次可见跳动；
 *   - 反过来，加了细行轨道却不写 `grid-row`，未定行的卡片只占 1 条 4px 轨道，会塌成细缝。
 */
export function primeColumnLayout(gridEl: HTMLElement, configuredColumns: number): number {
  const columns = effectiveColumns(availableWidth(gridEl), configuredColumns);
  const template = `repeat(${columns}, minmax(0, 1fr))`;
  if (gridEl.style.gridTemplateColumns !== template) {
    gridEl.style.gridTemplateColumns = template;
  }
  gridEl.addClass("is-column-layout");
  const autoRows = `${ROW_UNIT}px`;
  if (gridEl.style.gridAutoRows !== autoRows) {
    gridEl.style.gridAutoRows = autoRows;
  }
  return columns;
}

/**
 * 按当前实测高度给已有卡片写 `grid-column` 与 `grid-row`。不接观察者，可以随时重复调用。
 *
 * 竖向间距读的是 `column-gap` 而不是 `row-gap`：`primeColumnLayout` 之后 row-gap 是 0，读它
 * 只会得到 0。用 column-gap 当唯一的间距来源，横竖间距因此天然一致。
 */
export function placeCards(
  gridEl: HTMLElement,
  cards: readonly LayoutCard[],
  columns: number,
): void {
  // 用元素所在文档的 window：弹出窗口里的元素属于另一个 window，取值口径要与元素一致
  const win = gridEl.ownerDocument.defaultView;
  const gap = win ? Number.parseFloat(win.getComputedStyle(gridEl).columnGap) || 0 : 0;
  const slots = computeColumnLayout(
    cards.map((c) => ({ col: c.col, span: c.span, height: c.el.getBoundingClientRect().height })),
    columns,
    ROW_UNIT,
    gap,
  );
  for (const [index, slot] of slots.entries()) {
    const el = cards[index]?.el;
    if (!el) {
      continue;
    }
    const column = `${slot.colStart} / span ${slot.colSpan}`;
    const row = `${slot.rowStart} / span ${slot.rowSpan}`;
    // 只在变化时写：这个函数是 ResizeObserver 回调的下游，无条件写会多出一轮无谓的样式重算，
    // 还可能把浏览器推进 "ResizeObserver loop completed" 那类告警
    if (el.style.gridColumn !== column) {
      el.style.gridColumn = column;
    }
    if (el.style.gridRow !== row) {
      el.style.gridRow = row;
    }
  }
}

/**
 * 给网格接上列布局，返回还原函数。
 *
 * 列数由这里单点决定并写进 `gridTemplateColumns`，所以 styles.css 里**不要**再用媒体查询
 * 覆盖列数或 `grid-column`——CSS 的 `!important` 会压过我们写的内联样式，两边打架。
 */
export function enableColumnLayout(
  gridEl: HTMLElement,
  cards: readonly LayoutCard[],
  configuredColumns: number,
): () => void {
  // 用元素所在文档的 window：弹出窗口里的元素属于另一个 window，取值口径要与元素一致
  const win = gridEl.ownerDocument.defaultView;

  const applyAll = (): void => {
    placeCards(gridEl, cards, primeColumnLayout(gridEl, configuredColumns));
  };

  /** 还原：类与细行轨道要摘掉，每张卡片的列与行也要清。列模板留着，下一轮 prime 会覆盖它。 */
  const restore = (): void => {
    gridEl.removeClass("is-column-layout");
    gridEl.style.removeProperty("grid-auto-rows");
    for (const card of cards) {
      // 两个都要清：只清行会让卡片卡在旧列号上，视图重建后位置全错
      card.el.style.removeProperty("grid-column");
      card.el.style.removeProperty("grid-row");
    }
  };

  if (!win || typeof win.ResizeObserver !== "function") {
    // 老环境降级：几何照样摆对，只是内容异步变高之后不会自动重算。
    // 注意不能"退回普通 Grid"——`placeCards` 写的行号是按细行轨道算的，
    // 不 prime 就等于把它们摆到 auto 行上，布局会整体错乱。
    applyAll();
    return restore;
  }

  /**
   * 整轮重算必须合并进一帧。
   *
   * 不能"哪张卡变了就只改那张"：一张卡片的高度会改变它**同列后继**所有卡片的 rowStart，
   * 逐张改会一边写一边重排、抖动明显。
   */
  let frame: number | null = null;
  const schedule = (): void => {
    if (frame !== null) {
      return;
    }
    frame = win.requestAnimationFrame(() => {
      frame = null;
      applyAll();
    });
  };

  const observer = new win.ResizeObserver(schedule);

  observer.observe(gridEl);
  // 父容器也要观察。栏宽被限制之后，面板变宽时网格自身的宽度停在上限不动，只观察网格的话
  // ResizeObserver 不会触发，列数就永远停在上一次的判断上——例如上限 700 时把面板从 800
  // 拉到 1400，本该从单列变回多列，实际却一直是单列。
  const parent = gridEl.parentElement;
  if (parent) {
    observer.observe(parent);
  }
  for (const card of cards) {
    observer.observe(card.el);
  }
  applyAll();

  return () => {
    if (frame !== null) {
      win.cancelAnimationFrame(frame);
      frame = null;
    }
    observer.disconnect();
    restore();
  };
}
