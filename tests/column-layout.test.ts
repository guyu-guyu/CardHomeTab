import { describe, expect, it } from "vitest";
import {
  computeColumnLayout,
  effectiveCol,
  effectiveColumns,
  effectiveSpan,
  NARROW_WIDTH,
  ROW_UNIT,
  rowSpan,
  type LayoutInput,
} from "../src/column-layout";

const card = (height: number, col = 0, span = 1): LayoutInput => ({ col, span, height });

/** 把 slot 还成像素顶部，方便直接断言视觉间距 */
const topOf = (rowStart: number): number => (rowStart - 1) * ROW_UNIT;

describe("rowSpan", () => {
  it("spans exactly the rows a card needs, including the reserved gap", () => {
    expect(rowSpan(40, 4, 16)).toBe(14);
    expect(rowSpan(48, 4, 16)).toBe(16);
  });

  it("rounds up, so content is never clipped", () => {
    expect(rowSpan(41, 4, 0)).toBe(11);
    expect(rowSpan(44, 4, 0)).toBe(11);
    expect(rowSpan(45, 4, 0)).toBe(12);
  });

  it("reserves the gap by occupying extra rows", () => {
    // 竖向间距不是 row-gap 留的，而是靠多占行，所以同一高度下 gap 越大跨越越多
    expect(rowSpan(100, 4, 0)).toBe(25);
    expect(rowSpan(100, 4, 16)).toBe(29);
  });

  it("survives the values a first measurement can produce", () => {
    expect(rowSpan(0, 4, 0)).toBe(1);
    expect(rowSpan(-50, 4, 16)).toBe(1);
    expect(rowSpan(Number.NaN, 4, 16)).toBe(1);
    expect(rowSpan(Number.POSITIVE_INFINITY, 4, 16)).toBe(1);
    expect(rowSpan(100, 4, Number.NaN)).toBe(25);
    expect(rowSpan(100, 0, 16)).toBe(1);
  });

  it("keeps the row unit fine enough to be invisible", () => {
    expect(ROW_UNIT).toBeGreaterThan(0);
    expect(ROW_UNIT).toBeLessThanOrEqual(8);
  });
});

describe("effectiveColumns", () => {
  it("collapses to a single column below the narrow threshold", () => {
    expect(effectiveColumns(NARROW_WIDTH - 1, 3)).toBe(1);
    expect(effectiveColumns(NARROW_WIDTH, 3)).toBe(3);
  });

  it("keeps the configured count before the first measurement", () => {
    // 宽度为 0 时按配置值算，否则首次渲染会先排成一列、拿到宽度后再跳一次
    expect(effectiveColumns(0, 3)).toBe(3);
    expect(effectiveColumns(Number.NaN, 3)).toBe(3);
  });

  it("guards against a nonsense configured count", () => {
    expect(effectiveColumns(1200, 0)).toBe(1);
    expect(effectiveColumns(1200, -2)).toBe(1);
  });
});

describe("effectiveSpan", () => {
  it("never lets a card be wider than the grid", () => {
    expect(effectiveSpan(2, 3)).toBe(2);
    expect(effectiveSpan(5, 3)).toBe(3);
    expect(effectiveSpan(2, 1)).toBe(1);
    expect(effectiveSpan(0, 3)).toBe(1);
  });
});

describe("effectiveCol", () => {
  it("round-robins the cards that have no explicit column", () => {
    expect(effectiveCol(0, 0, 3, 1)).toBe(1);
    expect(effectiveCol(0, 1, 3, 1)).toBe(2);
    expect(effectiveCol(0, 2, 3, 1)).toBe(3);
    expect(effectiveCol(0, 3, 3, 1)).toBe(1);
  });

  it("honours an explicit column", () => {
    expect(effectiveCol(2, 0, 3, 1)).toBe(2);
    expect(effectiveCol(3, 0, 3, 1)).toBe(3);
  });

  it("clamps a column that the current grid no longer has", () => {
    // 设置里把列数从 3 改成 2 时，col=3 的存量卡片要落回最后一列而不是撑出隐式列
    expect(effectiveCol(3, 0, 2, 1)).toBe(2);
    expect(effectiveCol(9, 0, 3, 1)).toBe(3);
  });

  it("leaves room for a wide card", () => {
    // 3 列里 col=3 且 span=2 的卡片必须退到列 2 起步，否则会撑出隐式第 4 列
    expect(effectiveCol(3, 0, 3, 2)).toBe(2);
    expect(effectiveCol(2, 0, 3, 2)).toBe(2);
    expect(effectiveCol(3, 0, 3, 3)).toBe(1);
  });

  it("ignores the column entirely in a single-column grid", () => {
    expect(effectiveCol(3, 0, 1, 1)).toBe(1);
    expect(effectiveCol(0, 5, 1, 1)).toBe(1);
  });
});

describe("computeColumnLayout", () => {
  it("packs each column tight, independently of the other columns", () => {
    // 这是整个改造的核心：列 1 有一张高卡片，不该把列 2、3 的后继卡片一起推下去
    const slots = computeColumnLayout(
      [card(300), card(100), card(200), card(80), card(150), card(120)],
      3,
      ROW_UNIT,
      16,
    );
    expect(slots.map((s) => s.colStart)).toEqual([1, 2, 3, 1, 2, 3]);
    // 第 4 张在列 1，紧跟第 1 张（300 + 16 间距）
    expect(topOf(slots[3]!.rowStart)).toBe(316);
    // 第 5 张在列 2，紧跟第 2 张（100 + 16）——没有被列 1 的高卡片连带下推
    expect(topOf(slots[4]!.rowStart)).toBe(116);
    // 第 6 张在列 3，紧跟第 3 张（200 + 16）
    expect(topOf(slots[5]!.rowStart)).toBe(216);
  });

  it("leaves exactly the gap between stacked cards", () => {
    const slots = computeColumnLayout([card(100, 1), card(60, 1), card(40, 1)], 3, ROW_UNIT, 16);
    expect(topOf(slots[1]!.rowStart) - 100).toBe(16);
    expect(topOf(slots[2]!.rowStart) - (topOf(slots[1]!.rowStart) + 60)).toBe(16);
  });

  it("starts every column at the top", () => {
    const slots = computeColumnLayout([card(100, 1), card(60, 2), card(40, 3)], 3, ROW_UNIT, 16);
    expect(slots.map((s) => s.rowStart)).toEqual([1, 1, 1]);
  });

  it("puts a wide card below the lowest of the columns it covers", () => {
    // 列 1 已占到 100，列 2 只占到 40 → 跨 1-2 的宽卡片要从 100+16 起
    const slots = computeColumnLayout(
      [card(100, 1), card(40, 2), card(50, 1, 2)],
      3,
      ROW_UNIT,
      16,
    );
    const wide = slots[2]!;
    expect(wide.colStart).toBe(1);
    expect(wide.colSpan).toBe(2);
    expect(topOf(wide.rowStart)).toBe(116);
  });

  it("pushes both covered columns below a wide card", () => {
    const slots = computeColumnLayout(
      [card(50, 1, 2), card(30, 1), card(30, 2)],
      3,
      ROW_UNIT,
      16,
    );
    // 宽卡片占 0..50，其后列 1 与列 2 的卡片都要排到它下方，且两者起点相同。
    // 这里断言的是区间而不是定值：50+16=66 不是 4 的整数倍，按粒度向上取整会多出 2px
    // 余量（这正是 ROW_UNIT 的代价，上限 ROW_UNIT-1）。写定值会把余量误当成 bug。
    const below = topOf(slots[1]!.rowStart);
    expect(below).toBe(topOf(slots[2]!.rowStart));
    expect(below).toBeGreaterThanOrEqual(50 + 16);
    expect(below).toBeLessThan(50 + 16 + ROW_UNIT);
  });

  it("keeps an empty column empty", () => {
    const slots = computeColumnLayout([card(100, 1), card(60, 1)], 3, ROW_UNIT, 16);
    expect(slots.every((s) => s.colStart === 1)).toBe(true);
  });

  it("stacks everything in one column when the grid is narrow", () => {
    const slots = computeColumnLayout(
      [card(100, 1), card(60, 3), card(40, 2, 2)],
      1,
      ROW_UNIT,
      16,
    );
    expect(slots.map((s) => s.colStart)).toEqual([1, 1, 1]);
    expect(slots.map((s) => s.colSpan)).toEqual([1, 1, 1]);
    expect(topOf(slots[1]!.rowStart)).toBe(116);
    expect(topOf(slots[2]!.rowStart)).toBe(192);
  });

  it("returns nothing for no cards", () => {
    expect(computeColumnLayout([], 3, ROW_UNIT, 16)).toEqual([]);
  });

  it("never produces a slot outside the grid", () => {
    const slots = computeColumnLayout(
      [card(50, 9, 5), card(50, 3, 2), card(50, 0, 1)],
      3,
      ROW_UNIT,
      16,
    );
    for (const slot of slots) {
      expect(slot.colStart).toBeGreaterThanOrEqual(1);
      expect(slot.colStart + slot.colSpan - 1).toBeLessThanOrEqual(3);
      expect(slot.rowStart).toBeGreaterThanOrEqual(1);
      expect(slot.rowSpan).toBeGreaterThanOrEqual(1);
    }
  });
});
