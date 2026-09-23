import { describe, expect, it, vi } from "vitest";
import {
  enableColumnLayout,
  placeCards,
  primeColumnLayout,
  ROW_UNIT,
  type LayoutCard,
} from "../src/column-layout";

/**
 * `column-layout.ts` 没有任何 import（包括 obsidian），所以可以直接用手写替身驱动，
 * 不需要 jsdom。替身只需覆盖它真正触碰的东西：style、addClass/removeClass、clientWidth、
 * getBoundingClientRect、ownerDocument.defaultView.getComputedStyle。
 */
class FakeStyle {
  private readonly values = new Map<string, string>();
  /** 记录写入次数，用来断言「值未变就不写」 */
  writes = 0;

  get gridTemplateColumns(): string {
    return this.values.get("grid-template-columns") ?? "";
  }
  set gridTemplateColumns(value: string) {
    this.writes++;
    this.values.set("grid-template-columns", value);
  }
  get gridAutoRows(): string {
    return this.values.get("grid-auto-rows") ?? "";
  }
  set gridAutoRows(value: string) {
    this.writes++;
    this.values.set("grid-auto-rows", value);
  }
  get gridColumn(): string {
    return this.values.get("grid-column") ?? "";
  }
  set gridColumn(value: string) {
    this.writes++;
    this.values.set("grid-column", value);
  }
  get gridRow(): string {
    return this.values.get("grid-row") ?? "";
  }
  set gridRow(value: string) {
    this.writes++;
    this.values.set("grid-row", value);
  }
  removeProperty(name: string): void {
    this.values.delete(name);
  }
  has(name: string): boolean {
    return this.values.has(name);
  }
}

class FakeEl {
  style = new FakeStyle();
  classSet = new Set<string>();
  clientWidth = 1200;
  /** 没有父元素时 availableWidth 退回自身宽度，所以默认留空 */
  parentElement: FakeEl | null = null;
  rect = { left: 0, top: 0, right: 0, bottom: 0, height: 0 };
  ownerDocument = {
    defaultView: {
      // placeCards 用它读 column-gap；不提供 ResizeObserver，走降级路径
      getComputedStyle: () => ({ columnGap: "16px" }),
    } as unknown as Window,
  };

  addClass(name: string): void {
    this.classSet.add(name);
  }
  removeClass(name: string): void {
    this.classSet.delete(name);
  }
  hasClass(name: string): boolean {
    return this.classSet.has(name);
  }
  getBoundingClientRect(): { height: number } {
    return this.rect;
  }
}

const gridOf = (clientWidth = 1200): FakeEl => {
  const el = new FakeEl();
  el.clientWidth = clientWidth;
  return el;
};

const cardOf = (height: number, col = 0, span = 1): LayoutCard => {
  const el = new FakeEl();
  el.rect = { left: 0, top: 0, right: 0, bottom: height, height };
  return { el: el as unknown as HTMLElement, col, span };
};

describe("primeColumnLayout", () => {
  it("writes the final geometry in one go", () => {
    // 三样必须一起给：只给列模板会在末尾多一次跳动，只给细行轨道会让未定行的卡片塌成细缝
    const grid = gridOf(1200);
    expect(primeColumnLayout(grid as unknown as HTMLElement, 3)).toBe(3);
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(grid.hasClass("is-column-layout")).toBe(true);
    expect(grid.style.gridAutoRows).toBe(`${ROW_UNIT}px`);
  });

  it("collapses to one column on a narrow grid", () => {
    const grid = gridOf(600);
    expect(primeColumnLayout(grid as unknown as HTMLElement, 3)).toBe(1);
    expect(grid.style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
  });

  it("keeps the configured count before the grid has a width", () => {
    // 首帧 clientWidth 还是 0，此时按配置列数处理，否则会先排成一列再跳
    const grid = gridOf(0);
    expect(primeColumnLayout(grid as unknown as HTMLElement, 3)).toBe(3);
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
  });

  /**
   * 「限制栏宽」给网格加 max-width，网格自身的 clientWidth 因此等于 min(可用宽, 上限)。
   * 列数必须按**可用宽**判，否则把栏宽设成小于 NARROW_WIDTH 的值就会把多列塌成单列——
   * 那个设置就成了「一开启就只剩一列」，用户看不出是哪里出的问题。
   */
  it("counts columns by the available width, not the capped grid width", () => {
    const stage = gridOf(1600);
    const grid = gridOf(700); // 栏宽被限制到 700
    grid.parentElement = stage;
    expect(primeColumnLayout(grid as unknown as HTMLElement, 3)).toBe(3);
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
  });

  it("still collapses when the pane itself is narrow", () => {
    // 反向：真正空间不够时仍要收成单列，不能因为改用父容器宽度就把这条规则弄丢
    const stage = gridOf(600);
    const grid = gridOf(600);
    grid.parentElement = stage;
    expect(primeColumnLayout(grid as unknown as HTMLElement, 3)).toBe(1);
  });

  it("does not rewrite values that already match", () => {
    const grid = gridOf(1200);
    primeColumnLayout(grid as unknown as HTMLElement, 3);
    const writes = grid.style.writes;
    primeColumnLayout(grid as unknown as HTMLElement, 3);
    expect(grid.style.writes).toBe(writes);
  });
});

describe("placeCards", () => {
  it("writes both the column and the row of every card", () => {
    // 只写列会让卡片落在一条 4px 的细行轨道上、塌成细缝，所以两者都必须写
    const grid = gridOf(1200);
    const cards = [cardOf(100, 1), cardOf(60, 2)];
    placeCards(grid as unknown as HTMLElement, cards, 3);
    for (const card of cards) {
      const style = (card.el as unknown as FakeEl).style;
      expect(style.gridColumn).not.toBe("");
      expect(style.gridRow).not.toBe("");
    }
  });

  it("stacks a column tight, reserving the gap in row units", () => {
    const grid = gridOf(1200);
    const cards = [cardOf(100, 1), cardOf(60, 1)];
    placeCards(grid as unknown as HTMLElement, cards, 3);
    const first = (cards[0]!.el as unknown as FakeEl).style;
    const second = (cards[1]!.el as unknown as FakeEl).style;
    expect(first.gridColumn).toBe("1 / span 1");
    expect(first.gridRow).toBe("1 / span 29"); // (100 + 16) / 4
    expect(second.gridRow).toBe("30 / span 19"); // (60 + 16) / 4 = 19
  });

  it("does not rewrite when nothing moved", () => {
    // 这个函数是 ResizeObserver 回调的下游，无条件写会与观察者叠成写-重排循环
    const grid = gridOf(1200);
    const cards = [cardOf(100, 1), cardOf(60, 2)];
    placeCards(grid as unknown as HTMLElement, cards, 3);
    const writes = cards.map((c) => (c.el as unknown as FakeEl).style.writes);
    placeCards(grid as unknown as HTMLElement, cards, 3);
    expect(cards.map((c) => (c.el as unknown as FakeEl).style.writes)).toEqual(writes);
  });

  it("survives an empty card list", () => {
    const grid = gridOf(1200);
    expect(() => placeCards(grid as unknown as HTMLElement, [], 3)).not.toThrow();
  });
});

describe("enableColumnLayout reuse contract", () => {
  /**
   * 网格元素现在跨刷新复用，所以「两轮之间它长什么样」必须钉死：
   * dispose 要摘掉类与细行轨道（否则下一轮建卡片时未定行的卡片会塌成细缝），
   * 但列模板留着无害——下一轮 prime 会覆盖它。
   */
  it("restores the grid but leaves the column template behind", () => {
    const grid = gridOf(1200);
    const cards = [cardOf(100, 1)];
    const dispose = enableColumnLayout(grid as unknown as HTMLElement, cards, 3);

    expect(grid.hasClass("is-column-layout")).toBe(true);
    expect(grid.style.gridAutoRows).toBe(`${ROW_UNIT}px`);

    dispose();
    expect(grid.hasClass("is-column-layout")).toBe(false);
    expect(grid.style.has("grid-auto-rows")).toBe(false);
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    const card = cards[0]!.el as unknown as FakeEl;
    expect(card.style.has("grid-column")).toBe(false);
    expect(card.style.has("grid-row")).toBe(false);
  });

  /**
   * 没有 ResizeObserver 的环境同样要 prime。早先这里"退回普通 Grid"是错的：
   * placeCards 写的行号是按细行轨道算的，不 prime 就等于把它们摆到 auto 行上，布局整体错乱。
   */
  it("still primes the geometry without a ResizeObserver", () => {
    const grid = gridOf(1200);
    const cards = [cardOf(100, 1)];
    const dispose = enableColumnLayout(grid as unknown as HTMLElement, cards, 3);
    expect(grid.hasClass("is-column-layout")).toBe(true);
    expect(grid.style.gridAutoRows).toBe(`${ROW_UNIT}px`);
    expect((cards[0]!.el as unknown as FakeEl).style.gridRow).not.toBe("");
    dispose();
  });

  it("observes the grid and every card when a ResizeObserver exists", () => {
    const observed: unknown[] = [];
    const disconnect = vi.fn();
    class FakeObserver {
      observe(target: unknown): void {
        observed.push(target);
      }
      disconnect = disconnect;
      unobserve(): void {}
    }
    const grid = gridOf(1200);
    grid.ownerDocument = {
      defaultView: {
        getComputedStyle: () => ({ columnGap: "16px" }),
        ResizeObserver: FakeObserver,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => undefined,
      } as unknown as Window,
    };
    const cards = [cardOf(100, 1), cardOf(60, 2)];
    const dispose = enableColumnLayout(grid as unknown as HTMLElement, cards, 3);
    // 网格 + 每张卡片都要观察：卡片内容异步变高时才能重排
    expect(observed).toHaveLength(3);
    dispose();
    expect(disconnect).toHaveBeenCalled();
  });

  /**
   * 栏宽被限制后，面板变宽时网格自身的宽度停在上限不动。只观察网格的话 ResizeObserver
   * 不会触发，列数就永远停在上一次的判断上——上限 700 时把面板从 800 拉到 1400，
   * 本该从单列变回多列，实际却一直是单列。
   */
  it("observes the parent as well, whose width is what decides the column count", () => {
    const observed: unknown[] = [];
    class FakeObserver {
      observe(target: unknown): void {
        observed.push(target);
      }
      disconnect(): void {}
      unobserve(): void {}
    }
    const stage = gridOf(1600);
    const grid = gridOf(700);
    grid.parentElement = stage;
    grid.ownerDocument = {
      defaultView: {
        getComputedStyle: () => ({ columnGap: "16px" }),
        ResizeObserver: FakeObserver,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => undefined,
      } as unknown as Window,
    };
    const dispose = enableColumnLayout(grid as unknown as HTMLElement, [cardOf(100, 1)], 3);
    expect(observed).toContain(stage);
    dispose();
  });
});
