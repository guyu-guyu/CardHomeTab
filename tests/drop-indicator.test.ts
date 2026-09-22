import { describe, expect, it } from "vitest";
import {
  computeDropIndex,
  indicatorPlacement,
  isInsideAnyCard,
  type Rect,
} from "../src/card-grid";

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

// 一行三张卡片，宽 100、高 50，间距 20
const row = [rect(0, 0, 100, 50), rect(120, 0, 220, 50), rect(240, 0, 340, 50)];
const origin = { left: 0, top: 0 };

describe("isInsideAnyCard", () => {
  it("accepts a point on a card, including its edges", () => {
    expect(isInsideAnyCard(row, 50, 25)).toBe(true);
    expect(isInsideAnyCard(row, 0, 0)).toBe(true);
    expect(isInsideAnyCard(row, 340, 50)).toBe(true);
  });

  it("rejects the gaps between cards", () => {
    // 卡片之间的空隙没有 preventDefault，那里放不下，不该给指示线
    expect(isInsideAnyCard(row, 110, 25)).toBe(false);
    expect(isInsideAnyCard(row, 230, 25)).toBe(false);
  });

  it("rejects points outside every card", () => {
    expect(isInsideAnyCard(row, 50, 200)).toBe(false);
    expect(isInsideAnyCard(row, 400, 25)).toBe(false);
    expect(isInsideAnyCard([], 50, 25)).toBe(false);
  });
});

describe("indicatorPlacement", () => {
  it("draws on the left edge of the card being pushed aside", () => {
    expect(indicatorPlacement(row, 0, origin)).toEqual({ left: 0, top: 0, height: 50 });
    expect(indicatorPlacement(row, 1, origin)).toEqual({ left: 120, top: 0, height: 50 });
    expect(indicatorPlacement(row, 2, origin)).toEqual({ left: 240, top: 0, height: 50 });
  });

  it("draws on the right edge of the last card when appending", () => {
    expect(indicatorPlacement(row, row.length, origin)).toEqual({
      left: 340,
      top: 0,
      height: 50,
    });
  });

  it("is relative to the grid, not the viewport", () => {
    // rects 来自 getBoundingClientRect（视口坐标），而线是网格的绝对定位子元素，
    // 不减掉网格自身的偏移就会整条画到页面别处去
    const scrolled = [rect(500, 300, 600, 350)];
    expect(indicatorPlacement(scrolled, 0, { left: 500, top: 280 })).toEqual({
      left: 0,
      top: 20,
      height: 50,
    });
  });

  it("follows each card's own height, which masonry makes uneven", () => {
    const ragged = [rect(0, 0, 100, 200), rect(120, 0, 220, 60)];
    expect(indicatorPlacement(ragged, 1, origin)?.height).toBe(60);
    expect(indicatorPlacement(ragged, 0, origin)?.height).toBe(200);
  });

  it("returns null when there is nothing to insert against", () => {
    expect(indicatorPlacement([], 0, origin)).toBeNull();
  });

  it("clamps an out-of-range index instead of reading past the array", () => {
    expect(indicatorPlacement(row, -5, origin)).toEqual({ left: 0, top: 0, height: 50 });
    expect(indicatorPlacement(row, 99, origin)).toEqual({ left: 340, top: 0, height: 50 });
  });

  /**
   * 指示线必须用 computeDropIndex 的原始结果。handleDrop 里那个 `target > from` 减 1 是
   * "移除源卡片后数组重新编号"的补偿，与视觉位置无关——拿它画线会整条偏一个卡位。
   */
  it("lines up with the raw drop index, not the reindexed one", () => {
    const x = 250; // 第三张卡片的左半边 → 插到它前面
    const raw = computeDropIndex(row, x, 25);
    expect(raw).toBe(2);
    expect(indicatorPlacement(row, raw, origin)?.left).toBe(240);

    // 若误用补偿后的下标（从第 0 张往后拖时会减 1），线会画到第二张卡片的左边
    const reindexed = raw > 0 ? raw - 1 : raw;
    expect(indicatorPlacement(row, reindexed, origin)?.left).toBe(120);
  });
});
