import { describe, expect, it } from "vitest";
import { applyColumnDrop } from "../src/dashboard/edit";
import { parseDashboard } from "../src/dashboard/parse";

const LEVEL = 2;

/** 三张卡片、都没写 col。3 列下按轮转分别落在列 1、2、3。 */
const PLAIN = ["# Home", "", "## A", "a", "", "## B", "b", "", "## C", "c", ""].join("\n");

function run(
  text: string,
  from: number,
  col: number,
  indexInCol: number,
  columns = 3,
): { text: string; lossy: boolean } {
  return applyColumnDrop({
    text,
    sections: parseDashboard(text, LEVEL),
    from,
    target: { col, indexInCol },
    columns,
    headingLevel: LEVEL,
  });
}

/** 取出每张卡片的标题与 col，方便一眼看出结果 */
function layout(text: string): Array<[string, number]> {
  return parseDashboard(text, LEVEL).map((s) => [s.title, s.meta.col]);
}

describe("applyColumnDrop", () => {
  it("freezes every unspecified column, so the other cards stop moving", () => {
    // 这是整个列布局能成立的前提：未指定 col 的卡片靠「笔记序号 % 列数」回退，而一次移动会让
    // 后续卡片的序号集体位移、连带跳列——正是用户抱怨的「拖完整个布局都变了」。
    const result = run(PLAIN, 0, 1, 1);
    expect(result.lossy).toBe(false);
    for (const [, col] of layout(result.text)) {
      expect(col).toBeGreaterThan(0);
    }
  });

  it("writes the columns the cards already occupied, so nothing moves visually", () => {
    // 固化写入的必须是「此刻的显示结果」，否则固化本身就会把布局打乱
    const result = run(PLAIN, 1, 2, 0);
    const byTitle = new Map(layout(result.text));
    expect(byTitle.get("A")).toBe(1);
    expect(byTitle.get("B")).toBe(2);
    expect(byTitle.get("C")).toBe(3);
  });

  it("moves a card into another column", () => {
    const result = run(PLAIN, 0, 3, 0);
    const entries = layout(result.text);
    const moved = entries.find(([title]) => title === "A");
    expect(moved?.[1]).toBe(3);
  });

  it("puts the card at the requested slot inside its new column", () => {
    // 先把 A 和 C 都放进列 3，再把 A 插到 C 前面
    const step1 = run(PLAIN, 0, 3, 1).text;
    const inCol3 = parseDashboard(step1, LEVEL)
      .filter((s) => s.meta.col === 3)
      .map((s) => s.title);
    expect(inCol3).toEqual(["C", "A"]);

    const from = parseDashboard(step1, LEVEL).findIndex((s) => s.title === "A");
    const step2 = run(step1, from, 3, 0).text;
    expect(
      parseDashboard(step2, LEVEL)
        .filter((s) => s.meta.col === 3)
        .map((s) => s.title),
    ).toEqual(["A", "C"]);
  });

  it("keeps the column write even when the note order does not change", () => {
    // 跨列但顺序不变是最容易被早退吞掉的情形：拖了、松手了、什么都没发生
    const oneColumn = ["# Home", "", "## A", "%%card: col=1%%", "a", ""].join("\n");
    const result = run(oneColumn, 0, 2, 0);
    expect(layout(result.text)).toEqual([["A", 2]]);
  });

  it("clamps a target column the grid does not have", () => {
    const result = run(PLAIN, 0, 9, 0, 2);
    const moved = layout(result.text).find(([title]) => title === "A");
    expect(moved?.[1]).toBe(2);
  });

  it("leaves the text untouched for an out-of-range source", () => {
    expect(run(PLAIN, 99, 1, 0).text).toBe(PLAIN);
    expect(run(PLAIN, -1, 1, 0).text).toBe(PLAIN);
  });

  it("does not corrupt the cards it rewrites on the way", () => {
    // 倒序写 meta 的理由：updateCardMeta 会改变它之后所有内容的偏移，从前往后写第二张就会
    // 用到失效偏移、把正文切坏。这里断言正文与标题全都还在。
    const result = run(PLAIN, 2, 1, 0);
    const sections = parseDashboard(result.text, LEVEL);
    expect(sections.map((s) => s.title).sort()).toEqual(["A", "B", "C"]);
    for (const body of ["a", "b", "c"]) {
      expect(result.text).toContain(body);
    }
  });

  it("preserves the rest of each metadata line", () => {
    const rich = [
      "# Home",
      "",
      "## A",
      "%%card: css=mine; span=2; icon=lucide-star; foo=bar%%",
      "a",
      "",
      "## B",
      "b",
      "",
    ].join("\n");
    const result = run(rich, 0, 2, 0);
    expect(result.text).toContain("css=mine");
    expect(result.text).toContain("span=2");
    expect(result.text).toContain("icon=lucide-star");
    expect(result.text).toContain("foo=bar");
    expect(result.text).toContain("col=2");
  });

  it("skips a lossy metadata line but still performs the move", () => {
    // 整次拖拽失败远比少写一个列号糟糕，所以这里只报 lossy、不中止
    const lossyText = [
      "# Home",
      "",
      "## A",
      "%%card: note=a;b%%",
      "a",
      "",
      "## B",
      "b",
      "",
      "## C",
      "c",
      "",
    ].join("\n");
    const result = run(lossyText, 2, 1, 0);
    expect(result.lossy).toBe(true);
    // A 那一行没被改写
    expect(result.text).toContain("%%card: note=a;b%%");
    // 但 C 确实被移到了最前面
    expect(parseDashboard(result.text, LEVEL)[0]?.title).toBe("C");
  });

  /**
   * 顶部是宽卡片时，单列卡片必须能落到它**上方**。
   *
   * 真实回归：列成员原先只按起始列判定，`col=1; span=2` 的宽卡片在列 2 里不被算成成员，
   * 于是"插到列 2 最上面"解析出的笔记下标排在宽卡片之后，卡片又被排回它下面——用户看到的
   * 就是"拖上去没反应"。
   */
  it("moves a card above a wide card that sits at the top", () => {
    const withWide = [
      "# Home",
      "",
      "## W",
      "%%card: span=2; col=1%%",
      "w",
      "",
      "## B",
      "%%card: col=2%%",
      "b",
      "",
    ].join("\n");
    // 把 B（笔记下标 1）拖到列 2 的最上面
    const result = run(withWide, 1, 2, 0);
    // 关键：B 必须排到 W **之前**，这样布局才会把 W 推到它下方
    expect(parseDashboard(result.text, LEVEL).map((s) => s.title)).toEqual(["B", "W"]);
  });

  it("keeps a card below the wide card when that is where it was dropped", () => {
    const withWide = [
      "# Home",
      "",
      "## W",
      "%%card: span=2; col=1%%",
      "w",
      "",
      "## B",
      "%%card: col=2%%",
      "b",
      "",
      "## C",
      "%%card: col=2%%",
      "c",
      "",
    ].join("\n");
    // 列 2 的成员是 [W, B, C]；插到第 2 位 = B 之后
    const result = run(withWide, 2, 2, 2);
    expect(parseDashboard(result.text, LEVEL).map((s) => s.title)).toEqual(["W", "B", "C"]);
  });

  it("appends into a column that has no cards", () => {
    const twoInOne = [
      "# Home",
      "",
      "## A",
      "%%card: col=1%%",
      "a",
      "",
      "## B",
      "%%card: col=1%%",
      "b",
      "",
    ].join("\n");
    const result = run(twoInOne, 0, 3, 0);
    const byTitle = new Map(layout(result.text));
    expect(byTitle.get("A")).toBe(3);
    expect(byTitle.get("B")).toBe(1);
  });
});
