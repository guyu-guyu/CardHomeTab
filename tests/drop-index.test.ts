import { describe, expect, it } from "vitest";
import { computeDropIndex } from "../src/card-grid";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe("computeDropIndex", () => {
  const row = [rect(0, 0, 100, 100), rect(100, 0, 200, 100), rect(200, 0, 300, 100)];
  const twoRows = [...row, rect(0, 120, 100, 220), rect(100, 120, 200, 220), rect(200, 120, 300, 220)];

  it("returns 0 when the pointer is above every card", () => {
    expect(computeDropIndex(row, 250, -10)).toBe(0);
  });

  it("returns the length when the pointer is below every card", () => {
    expect(computeDropIndex(row, 250, 999)).toBe(3);
    expect(computeDropIndex(twoRows, 150, 999)).toBe(6);
  });

  it("inserts before a card when the pointer is left of its centre", () => {
    expect(computeDropIndex(row, 110, 50)).toBe(1);
    expect(computeDropIndex(row, 210, 50)).toBe(2);
  });

  it("inserts after a card when the pointer is right of its centre", () => {
    expect(computeDropIndex(row, 180, 50)).toBe(2);
    expect(computeDropIndex(row, 290, 50)).toBe(3);
  });

  it("uses the vertical position first so rows do not interleave", () => {
    expect(computeDropIndex(twoRows, 290, 50)).toBe(3);
    // x=10 落在第二行所有卡片的左侧，按「左侧即插在该卡之前」应得第二行行首的 3；
    // 若先比 x 再比 y 会得到 0。计划原文此处写 4，与它自己的实现冲突（实测得 3）：
    // 只有 x ∈ [50, 150) 才可能得到 4，而 10 连第一张卡的中线都没到。
    expect(computeDropIndex(twoRows, 10, 150)).toBe(3);
    expect(computeDropIndex(twoRows, 290, 150)).toBe(6);
  });

  it("handles an empty grid", () => {
    expect(computeDropIndex([], 10, 10)).toBe(0);
  });
});
