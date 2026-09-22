/**
 * 卡片瀑布流布局。
 *
 * 为什么需要它：`.home-tab-cards` 是 CSS Grid，同一行的所有卡片共享行高（由最高那张决定），
 * 于是矮卡片下方会留出空白，而不是让下面的卡片贴上来。真正的 `grid-template-rows: masonry`
 * 在 Chromium 118（本插件 minAppVersion 1.9.0 的下限）还没有，所以用经典做法：把行高切成
 * 细粒度轨道，再按实测高度让每张卡片跨越相应的行数。
 *
 * 这条路线保住了两件 CSS 多列布局做不到的事：卡片顺序仍与笔记一致（多列会变成按列填充），
 * 以及 `span=2` 宽卡片仍然有效（多列布局没有"跨列"概念）。
 */

/**
 * `grid-auto-rows` 的粒度。越小越精确，代价是隐式行轨道变多；
 * 4px 时一张卡片底部最多多出 3px 余量，视觉上看不出来。
 */
export const MASONRY_ROW_UNIT = 4;

/**
 * 算出一张卡片该跨多少个细行。
 *
 * 行间距不是靠 `row-gap` 留的（那会让可用高度变成 K*unit + (K-1)*gap，粒度被 gap 撑得很粗），
 * 而是靠"多占几行"来留，所以启用瀑布流时 `row-gap` 必须是 0，这里把间距加进高度一起换算。
 */
export function rowSpan(height: number, rowUnit: number, gap: number): number {
  if (!Number.isFinite(height) || height <= 0 || rowUnit <= 0) {
    return 1;
  }
  const reserved = height + (Number.isFinite(gap) && gap > 0 ? gap : 0);
  return Math.max(1, Math.ceil(reserved / rowUnit));
}

/**
 * 给网格接上瀑布流，返回还原函数。
 *
 * 必须观察每张卡片而不是只在渲染后量一次：图片、base 视图、dataview 都是异步出内容的，
 * 渲染函数返回时它们的高度还不是最终值，只量一次会让卡片底部留下一大片空白或被裁掉。
 */
export function enableMasonry(gridEl: HTMLElement): () => void {
  // 用卡片所在文档的 window：弹出窗口里的元素属于另一个 window，全局 ResizeObserver
  // 虽然也能用，但取值口径应当与元素自身保持一致。
  const win = gridEl.ownerDocument.defaultView;
  if (!win || typeof win.ResizeObserver !== "function") {
    // 老环境降级：不接瀑布流，`is-masonry` 不加，row-gap 保持原样，退回普通 Grid，
    // 卡片之间仍有间距，只是不会向上贴紧。
    return () => undefined;
  }

  const cards = (): HTMLElement[] =>
    // 用 Obsidian 的 `.instanceOf(HTMLElement)`（跨窗口安全）而不是原生 instanceof，
    // 且 obsidianmd/prefer-instanceof 是 --max-warnings 0 下的硬门禁。
    Array.from(gridEl.children).filter(
      (child): child is HTMLElement =>
        child.instanceOf(HTMLElement) && child.hasClass("home-card"),
    );

  /**
   * 竖向间距读的是 `column-gap` 而不是 `row-gap`：启用瀑布流后 row-gap 被置为 0，
   * 读它只会得到 0。用 column-gap 当作唯一的间距来源，横竖间距因此天然一致。
   */
  const gapOf = (): number => Number.parseFloat(win.getComputedStyle(gridEl).columnGap) || 0;

  const applyTo = (card: HTMLElement, gap: number): void => {
    const span = rowSpan(card.getBoundingClientRect().height, MASONRY_ROW_UNIT, gap);
    const next = `span ${span}`;
    // 只在变化时写：ResizeObserver 回调里改样式，无条件写会多出一轮无谓的样式重算
    if (card.style.gridRowEnd !== next) {
      card.style.gridRowEnd = next;
    }
  };

  const applyAll = (): void => {
    const gap = gapOf();
    for (const card of cards()) {
      applyTo(card, gap);
    }
  };

  const observer = new win.ResizeObserver((entries) => {
    // 网格自身变宽窄会让所有卡片重新折行、高度全变，所以整体重算；
    // 单张卡片的尺寸变化只重算它自己。
    if (entries.some((entry) => entry.target === gridEl)) {
      applyAll();
      return;
    }
    const gap = gapOf();
    for (const entry of entries) {
      const target = entry.target;
      if (target.instanceOf(HTMLElement)) {
        applyTo(target, gap);
      }
    }
  });

  gridEl.addClass("is-masonry");
  gridEl.style.gridAutoRows = `${MASONRY_ROW_UNIT}px`;
  observer.observe(gridEl);
  for (const card of cards()) {
    observer.observe(card);
  }
  applyAll();

  return () => {
    observer.disconnect();
    gridEl.removeClass("is-masonry");
    gridEl.style.removeProperty("grid-auto-rows");
    for (const card of cards()) {
      card.style.removeProperty("grid-row-end");
    }
  };
}
