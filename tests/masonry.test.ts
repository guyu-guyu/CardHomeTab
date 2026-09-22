import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MASONRY_ROW_UNIT, rowSpan } from "../src/masonry";

describe("rowSpan", () => {
  it("spans exactly the rows a card needs, including the reserved gap", () => {
    // 高 40、间距 16、粒度 4 → 需要 56px → 14 行
    expect(rowSpan(40, 4, 16)).toBe(14);
    // 刚好整除时不该多占一行
    expect(rowSpan(48, 4, 16)).toBe(16);
  });

  it("rounds up, so content is never clipped", () => {
    // 余量只会向上取整（最多多出 rowUnit-1 px），绝不能向下取整把卡片裁掉
    expect(rowSpan(41, 4, 0)).toBe(11);
    expect(rowSpan(43, 4, 0)).toBe(11);
    expect(rowSpan(44, 4, 0)).toBe(11);
    expect(rowSpan(45, 4, 0)).toBe(12);
  });

  it("reserves the gap by occupying extra rows", () => {
    // 竖向间距不是 row-gap 留的，而是靠多占行，所以同一高度下 gap 越大跨越越多
    expect(rowSpan(100, 4, 0)).toBe(25);
    expect(rowSpan(100, 4, 16)).toBe(29);
  });

  it("never returns less than one row", () => {
    expect(rowSpan(0, 4, 0)).toBe(1);
    expect(rowSpan(1, 4, 0)).toBe(1);
    expect(rowSpan(-50, 4, 16)).toBe(1);
  });

  it("survives the values a first measurement can produce", () => {
    // 卡片还没进文档时 getBoundingClientRect 会给 0；NaN 来自 parseFloat 读不到间距
    expect(rowSpan(Number.NaN, 4, 16)).toBe(1);
    expect(rowSpan(Number.POSITIVE_INFINITY, 4, 16)).toBe(1);
    expect(rowSpan(100, 4, Number.NaN)).toBe(25);
    expect(rowSpan(100, 0, 16)).toBe(1);
  });

  it("keeps the row unit fine enough to be invisible", () => {
    // 粒度决定卡片底部最多多出多少余量；超过一格间距就会看得出来
    expect(MASONRY_ROW_UNIT).toBeGreaterThan(0);
    expect(MASONRY_ROW_UNIT).toBeLessThanOrEqual(8);
  });
});

describe("masonry stylesheet contract", () => {
  const stylesheet = readFileSync(
    fileURLToPath(new URL("../styles.css", import.meta.url)),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, " ");

  /**
   * 竖向间距靠"多占行"来留，所以启用瀑布流时 row-gap 必须是 0；rowSpan 的换算正是按这个前提
   * 写的。若有人把这条规则删掉或改成非 0，卡片底部会凭空多出一大截，而且是运行时才看得见。
   */
  it("zeroes row-gap only when masonry is on", () => {
    expect(/\.home-tab-cards\.is-masonry\s*\{[^}]*row-gap:\s*0/.test(stylesheet)).toBe(true);
  });

  /** 降级路径：没有 ResizeObserver 时不加 is-masonry，普通 Grid 仍需保留卡片间距 */
  it("keeps a gap on the plain grid for the no-ResizeObserver fallback", () => {
    const plain = /\.home-tab-cards\s*\{([^}]*)\}/.exec(stylesheet);
    expect(plain).not.toBeNull();
    expect(plain?.[1]).toContain("gap:");
  });
});
