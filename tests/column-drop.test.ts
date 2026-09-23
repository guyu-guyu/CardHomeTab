import { describe, expect, it } from "vitest";
import {
  columnAt,
  columnBand,
  columnMembers,
  computeColumnDrop,
  dropTargetToNoteIndex,
  horizontalIndicator,
  resolveDragIndex,
  type Rect,
} from "../src/card-grid";

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

// 3 列、每列宽 100、间距 20 → 网格宽 340
const GRID = rect(0, 0, 340, 500);
const COLUMNS = 3;
const GAP = 20;

// 列1: 卡0(高100)、卡3(高60)   列2: 卡1(高200)   列3: 卡2(高80)
const rects = [
  rect(0, 0, 100, 100),
  rect(120, 0, 220, 200),
  rect(240, 0, 340, 80),
  rect(0, 120, 100, 180),
];
/** 每张卡片占的列范围。宽卡片必须带上 span，否则它在"顺带覆盖的列"里会被当成不存在。 */
const one = (col: number) => ({ col, span: 1 });
const cols = [one(1), one(2), one(3), one(1)];

describe("columnBand", () => {
  it("splits the grid into equal columns with the gap between them", () => {
    expect(columnBand(340, 3, 20, 1)).toEqual({ left: 0, width: 100 });
    expect(columnBand(340, 3, 20, 2)).toEqual({ left: 120, width: 100 });
    expect(columnBand(340, 3, 20, 3)).toEqual({ left: 240, width: 100 });
  });

  it("works for an empty column, which has no card to measure", () => {
    // 靠卡片反推列位置的话空列就无从下手，所以列宽必须是纯算出来的
    expect(columnBand(340, 3, 20, 3).left).toBe(240);
  });

  it("clamps a column outside the grid", () => {
    expect(columnBand(340, 3, 20, 9)).toEqual({ left: 240, width: 100 });
    expect(columnBand(340, 3, 20, 0)).toEqual({ left: 0, width: 100 });
  });

  it("survives a grid that has not been laid out yet", () => {
    expect(columnBand(0, 3, 20, 2)).toEqual({ left: 0, width: 0 });
  });
});

describe("columnAt", () => {
  it("maps every x to a column, with no dead zone in the gaps", () => {
    // 按等分切片而不是精确列区间：否则列缝那几个像素会变成"哪列都不是"，拖上去没有落点
    expect(columnAt(340, 3, 0)).toBe(1);
    expect(columnAt(340, 3, 110)).toBe(1);
    expect(columnAt(340, 3, 115)).toBe(2);
    expect(columnAt(340, 3, 230)).toBe(3);
    expect(columnAt(340, 3, 339)).toBe(3);
  });

  it("clamps outside the grid", () => {
    expect(columnAt(340, 3, -50)).toBe(1);
    expect(columnAt(340, 3, 9999)).toBe(3);
  });

  it("falls back to the first column before layout", () => {
    expect(columnAt(0, 3, 100)).toBe(1);
  });
});

describe("columnMembers", () => {
  it("lists a column's cards in note order", () => {
    expect(columnMembers(cols, 1)).toEqual([0, 3]);
    expect(columnMembers(cols, 2)).toEqual([1]);
    expect(columnMembers([one(1), one(1), one(1)], 2)).toEqual([]);
  });
});

describe("computeColumnDrop", () => {
  it("inserts above a card when the pointer is in its upper half", () => {
    // 卡0 占 0..100，中点 50 → y=40 在上半 → 插到它前面
    expect(computeColumnDrop(rects, cols, GRID, COLUMNS, 50, 40)).toEqual({
      col: 1,
      indexInCol: 0,
    });
  });

  it("inserts below a card when the pointer is in its lower half", () => {
    // y=60 过了卡0 中点，但没过卡3（120..180，中点 150）→ 落在两者之间
    expect(computeColumnDrop(rects, cols, GRID, COLUMNS, 50, 60)).toEqual({
      col: 1,
      indexInCol: 1,
    });
  });

  it("appends to the column when the pointer is below every card in it", () => {
    expect(computeColumnDrop(rects, cols, GRID, COLUMNS, 50, 480)).toEqual({
      col: 1,
      indexInCol: 2,
    });
  });

  it("targets the column under the pointer, not the nearest card", () => {
    // 列2 只有卡1，x=150 落在列2
    expect(computeColumnDrop(rects, cols, GRID, COLUMNS, 150, 400)).toEqual({
      col: 2,
      indexInCol: 1,
    });
  });

  it("accepts a drop into a column that has no cards at all", () => {
    // 这是列布局最常用也最容易漏掉的操作：把卡片拖进空列
    expect(computeColumnDrop(rects, [one(1), one(1), one(1), one(1)], GRID, COLUMNS, 250, 300)).toEqual({
      col: 3,
      indexInCol: 0,
    });
  });

  it("is relative to the grid, not the viewport", () => {
    const shifted = rect(500, 300, 840, 800);
    expect(computeColumnDrop([], [], shifted, COLUMNS, 500 + 250, 400)).toEqual({
      col: 3,
      indexInCol: 0,
    });
  });
});

/**
 * 顶部有一张宽卡片时，别的卡片必须能拖到它**上方**。
 *
 * 这是一条真实回归：列成员原先只按起始列判定，于是 `col=1; span=2` 的宽卡片在列 2 里
 * 是"不存在"的。往列 2 顶部拖时落点被算成"插到列 2 第一张单列卡之前"，而那个位置在笔记里
 * 恰好排在宽卡片**之后**——新卡片于是又被排到宽卡片下面，表现就是"拖上去没反应"。
 */
describe("a wide card at the top", () => {
  // 沿用本文件的几何：340 宽 / 3 列 / gap 20 → 列区间 0..100、120..220、240..340，
  // 命中判定按等分切片 113.3 一段（列2 = 113.3..226.7）。
  // 卡0 = 宽卡片 col=1 span=2（占列 1-2，顶部 0..150）；卡1 = 单列 col=2（在它下方）
  const wide = [{ col: 1, span: 2 }, one(2)];
  const wideRects = [rect(0, 0, 220, 150), rect(120, 170, 220, 270)];

  it("counts the wide card as a member of every column it covers", () => {
    expect(columnMembers(wide, 1)).toEqual([0]);
    expect(columnMembers(wide, 2)).toEqual([0, 1]);
    expect(columnMembers(wide, 3)).toEqual([]);
  });

  it("targets the slot above the wide card when dropping at the top of its second column", () => {
    const target = computeColumnDrop(wideRects, wide, GRID, COLUMNS, 150, 20);
    expect(target).toEqual({ col: 2, indexInCol: 0 });
    // 关键：这个下标必须落在宽卡片**之前**（它在笔记里是第 0 张）
    expect(dropTargetToNoteIndex(wide, target)).toBe(0);
  });

  it("still targets below the wide card when dropping under it", () => {
    const target = computeColumnDrop(wideRects, wide, GRID, COLUMNS, 150, 200);
    expect(target).toEqual({ col: 2, indexInCol: 1 });
    expect(dropTargetToNoteIndex(wide, target)).toBe(1);
  });

  it("draws the indicator along the wide card's top edge, not below it", () => {
    expect(
      horizontalIndicator(wideRects, wide, GRID, COLUMNS, GAP, { col: 2, indexInCol: 0 }),
    ).toEqual({ left: 120, top: 0, width: 100 });
  });
});

describe("dropTargetToNoteIndex", () => {
  it("returns the note index of the card being pushed down", () => {
    expect(dropTargetToNoteIndex(cols, { col: 1, indexInCol: 0 })).toBe(0);
    expect(dropTargetToNoteIndex(cols, { col: 1, indexInCol: 1 })).toBe(3);
  });

  it("goes just past the last card when appending to a column", () => {
    expect(dropTargetToNoteIndex(cols, { col: 1, indexInCol: 2 })).toBe(4);
    expect(dropTargetToNoteIndex(cols, { col: 2, indexInCol: 1 })).toBe(2);
  });

  it("appends at the end of the note for an empty column", () => {
    // 空列里笔记顺序无所谓——决定位置的是列归属本身
    expect(dropTargetToNoteIndex([one(1), one(1), one(1)], { col: 3, indexInCol: 0 })).toBe(3);
  });

  /**
   * 这里返回的是**移除之前**的下标，而 edit.ts 的 moveCard 里 `to` 是**移除之后**的下标。
   * 调用方必须补 `raw > from ? raw - 1 : raw`，否则往后拖会整体偏一格。
   */
  it("needs the caller's post-removal compensation", () => {
    const raw = dropTargetToNoteIndex(cols, { col: 1, indexInCol: 2 });
    expect(raw).toBe(4);
    const from = 0;
    expect(raw > from ? raw - 1 : raw).toBe(3);
  });
});

describe("horizontalIndicator", () => {
  it("hugs the bottom edge of the card above the insertion point", () => {
    // 卡0 占 0..100、卡3 占 120..180（同在列 1）。插到两者之间时贴**上方**那张的下边界(100)，
    // 而不是下方那张的上边界(120)——后者在列底有宽卡片撑出长空白时会跑到屏幕外。
    expect(
      horizontalIndicator(rects, cols, GRID, COLUMNS, GAP, { col: 1, indexInCol: 1 }),
    ).toEqual({ left: 0, top: 100, width: 100 });
  });

  it("hugs the top edge of the first card when inserting at the head of a column", () => {
    // 列首没有"上方那张卡片"，只能贴第一张的上边界
    expect(
      horizontalIndicator(rects, cols, GRID, COLUMNS, GAP, { col: 1, indexInCol: 0 }),
    ).toEqual({ left: 0, top: 0, width: 100 });
  });

  /**
   * 列底部的宽卡片要等它所跨的各列都腾出位置才能落下，于是本列会空出很长一段。
   * 指示线必须留在空白**上沿**（紧挨刚越过的那张卡片），不能跑到空白另一端的宽卡片顶部——
   * 那个位置往往已经在屏幕外，用户根本看不到自己拖到哪了。
   */
  it("stays at the near edge of a long gap left by a wide card below", () => {
    const short = one(2);
    const wideBelow = { col: 1, span: 2 };
    // 列 2：卡0 占 0..80，宽卡片(卡1) 被推到很下面 0..? → 顶部 900
    const gapRects = [rect(120, 0, 220, 80), rect(0, 900, 220, 1000)];
    const line = horizontalIndicator(
      gapRects,
      [short, wideBelow],
      rect(0, 0, 340, 1200),
      COLUMNS,
      GAP,
      { col: 2, indexInCol: 1 },
    );
    expect(line.top).toBe(80);
    expect(line.top).toBeLessThan(900);
  });

  it("draws on the bottom edge of the last card when appending", () => {
    expect(
      horizontalIndicator(rects, cols, GRID, COLUMNS, GAP, { col: 1, indexInCol: 2 }),
    ).toEqual({ left: 0, top: 180, width: 100 });
  });

  it("draws at the top of an empty column", () => {
    expect(
      horizontalIndicator(rects, [one(1), one(1), one(1), one(1)], GRID, COLUMNS, GAP, { col: 3, indexInCol: 0 }),
    ).toEqual({ left: 240, top: 0, width: 100 });
  });

  it("spans the target column, so the line reads as belonging to it", () => {
    const line = horizontalIndicator(rects, cols, GRID, COLUMNS, GAP, {
      col: 2,
      indexInCol: 0,
    });
    expect(line.left).toBe(120);
    expect(line.width).toBe(100);
  });

  it("is relative to the grid, not the viewport", () => {
    const shifted = rect(500, 300, 840, 800);
    const moved = [rect(500, 420, 600, 500)];
    expect(horizontalIndicator(moved, [one(1)], shifted, COLUMNS, GAP, { col: 1, indexInCol: 0 })).toEqual(
      { left: 0, top: 120, width: 100 },
    );
  });
});

describe("resolveDragIndex", () => {
  it("parses the payload written at dragstart", () => {
    expect(resolveDragIndex("3")).toBe(3);
    expect(resolveDragIndex("0")).toBe(0);
  });

  it("returns null for anything unparsable, so the caller skips the drop", () => {
    // 绝不能退回调用方自己的 index：drop 落在目标卡片上，用它当 from 会让拖拽退化成空操作
    expect(resolveDragIndex("")).toBeNull();
    expect(resolveDragIndex("abc")).toBeNull();
  });
});
