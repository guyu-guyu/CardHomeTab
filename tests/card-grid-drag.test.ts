import { afterAll, describe, expect, it, vi } from "vitest";
import { enableCardDrag, enableGridDrop, type DropTarget } from "../src/card-grid";

/**
 * 驱动交互层的接线，跑的是真正的监听器与换算，只把 DOM 换成手写替身（仓库里没有 jsdom，
 * 也不想为此加依赖）。
 *
 * 职责划分要记牢：`enableCardDrag` 只管**成为拖拽源**（draggable 开关、dragstart 写载荷、
 * dragend 收尾）；落点判定、放行与投放整体挂在**网格**上（`enableGridDrop`）。上移的原因是
 * 卡片之间、短列底部、空列那些区域没有任何卡片，按卡片挂 `dragover` 就不会 preventDefault，
 * 那些位置根本收不到 drop——而"把卡片拖到某列最下面"恰恰是列布局最常用的操作。
 *
 * 这里最要紧的几条回归：
 *   - 被拖卡片的下标只能从 dragstart 写下的载荷里取。drop 落在指针下方的元素上，若改用闭包
 *     里的 index，那就是目标卡片自己，拖拽会退化成空操作且不报错。
 *   - dragstart 必须**卡片自己就是拖拽源**：正文里链接的 dragstart 会冒泡到卡片上。
 *   - dragover / drop 只认「这次 drag 自己的 dataTransfer 上带着我们的私有类型」，否则从系统
 *     拖进来的文件会被当成可落点吞掉。
 *   - 归属标记放在 dataTransfer 上而不是任何可变状态里：落一次卡片会触发重建、源卡片被销毁，
 *     `dragend` 可能根本不触发，模块级变量这时会把过期下标漏给下一次外来拖拽。
 */

type Listener = (event: unknown) => void;

/** 把手的 ownerDocument 替身：enableCardDrag 把 pointerup / pointercancel 挂在它上面。 */
class FakeOwnerDocument {
  listeners = new Map<string, Set<Listener>>();

  addEventListener = vi.fn((type: string, listener: Listener): void => {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  });

  removeEventListener = vi.fn((type: string, listener: Listener): void => {
    this.listeners.get(type)?.delete(listener);
  });

  fire(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }
}

class FakeEl {
  attributes = new Map<string, string>();
  classSet = new Set<string>();
  dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  listeners = new Map<string, Set<Listener>>();
  rect = { left: 0, top: 0, right: 0, bottom: 0 };
  /** 指示线会往上写 left/top/width */
  style: Record<string, string> = {};
  clientWidth = 0;
  parent: FakeEl | null = null;
  ownerDocument = new FakeOwnerDocument();

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addClass(name: string): void {
    this.classSet.add(name);
  }

  removeClass(name: string): void {
    this.classSet.delete(name);
  }

  hasClass(name: string): boolean {
    return this.classSet.has(name);
  }

  instanceOf(type: unknown): boolean {
    return type === FakeEl;
  }

  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number } {
    return this.rect;
  }

  /** enableGridDrop 用它建指示线 */
  createDiv(options: { cls?: string }): FakeEl {
    const el = new FakeEl();
    if (options.cls) {
      el.classSet.add(options.cls);
    }
    el.parent = this;
    this.children.push(el);
    return el;
  }

  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (this.parent && index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }

  fire(type: string, event: unknown): void {
    if (event !== null && typeof event === "object" && !("target" in event)) {
      (event as { target?: unknown }).target = this;
    }
    // 真实浏览器只对 draggable 的**拖拽源**发起 dragstart；替身照抄这条约束，
    // 否则「没按抓手也能拖」会被误判成缺陷——代码本身没做这个检查，靠的就是浏览器行为。
    if (type === "dragstart" && !(targetOf(event) ?? this).attributes.has("draggable")) {
      return;
    }
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  listenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
}

/** 替身事件的 `target`（真实 DOM 里指向事件源）。调用方没写就是 undefined。 */
function targetOf(event: unknown): FakeEl | undefined {
  return event !== null && typeof event === "object" && "target" in event
    ? (event as { target?: FakeEl }).target
    : undefined;
}

// 用 vi.stubGlobal 而不是直接写 globalThis：obsidianmd/no-global-this 是 --max-warnings 0
// 下的硬门禁，且不可 disable。
vi.stubGlobal("HTMLElement", FakeEl);
afterAll(() => {
  vi.unstubAllGlobals();
});

interface FakeDragEvent {
  clientX: number;
  clientY: number;
  prevented: boolean;
  target?: unknown;
  dataTransfer: FakeDataTransfer;
  preventDefault(): void;
}

/** 一次拖拽手势的 `dataTransfer` 替身。`types` 跟随 `setData`——src 的闸门查的正是这个列表
 *  （dragover 阶段真实浏览器处于保护模式、getData 返回空串，但 types 依然可读）。
 *  真实浏览器里整次拖拽共用一个对象、下一次换新对象，这里照抄：归属因此随拖拽生灭。 */
interface FakeDataTransfer {
  readonly types: string[];
  effectAllowed: string;
  setData(format: string, value: string): void;
  getData(format: string): string;
}

/** `seed` 用来模拟外来的拖拽（例如系统里拖进来的文件只有 text/plain 与 uri-list）。 */
function fakeDataTransfer(seed: Record<string, string> = {}): FakeDataTransfer {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    get types(): string[] {
      return [...data.keys()];
    },
    effectAllowed: "",
    setData(format: string, value: string): void {
      data.set(format, value);
    },
    getData(format: string): string {
      return data.get(format) ?? "";
    },
  };
}

function dragEvent(
  clientX: number,
  clientY: number,
  transfer: FakeDataTransfer = fakeDataTransfer(),
): FakeDragEvent {
  return {
    clientX,
    clientY,
    prevented: false,
    dataTransfer: transfer,
    preventDefault() {
      this.prevented = true;
    },
  };
}

interface Harness {
  grid: FakeEl;
  cards: FakeEl[];
  handles: FakeEl[];
  dropped: Array<[number, DropTarget]>;
  dispose(): void;
}

/**
 * 三张卡片各占一列。
 *
 * 网格宽度必须 ≥ NARROW_WIDTH(900)，否则 `effectiveColumns` 会把它判成窄屏、收成单列，
 * 多列的用例就全部失去意义。这里用 1000：列宽 (1000-2*20)/3 = 320，
 * 列区间 0..320 / 340..660 / 680..1000，而命中判定按等分切片 333.3 一段。
 */
function harness(): Harness {
  const grid = new FakeEl();
  grid.rect = { left: 0, top: 0, right: 1000, bottom: 500 };
  grid.clientWidth = 1000;

  const cards: FakeEl[] = [];
  const handles: FakeEl[] = [];
  const dropped: Array<[number, DropTarget]> = [];
  const disposers: Array<() => void> = [];

  for (let i = 0; i < 3; i++) {
    const card = new FakeEl();
    card.classSet.add("home-card");
    const left = i * 340;
    card.rect = { left, top: 0, right: left + 320, bottom: 100 };
    grid.children.push(card);
    cards.push(card);

    const handle = new FakeEl();
    handles.push(handle);

    disposers.push(
      enableCardDrag({
        cardEl: card as unknown as HTMLElement,
        handleEl: handle as unknown as HTMLElement,
        index: i,
        isEnabled: () => true,
      }),
    );
  }

  disposers.push(
    enableGridDrop({
      gridEl: grid as unknown as HTMLElement,
      cards: cards.map((card, i) => ({
        el: card as unknown as HTMLElement,
        col: i + 1,
        span: 1,
      })),
      configuredColumns: 3,
      onDrop: (from, target) => dropped.push([from, target]),
    }),
  );

  return {
    grid,
    cards,
    handles,
    dropped,
    dispose: () => {
      for (const dispose of disposers) {
        dispose();
      }
    },
  };
}

/** 完整跑一次手势：按抓手 → dragstart（卡片上）→ dragover/drop（**网格上**）→ dragend。
 *  整次拖拽共用同一个 `dataTransfer`，真实浏览器就是如此。 */
function dragTo(h: Harness, from: number, x: number, y: number): FakeDragEvent {
  const transfer = fakeDataTransfer();
  h.handles[from]!.fire("pointerdown", {});
  h.cards[from]!.fire("dragstart", dragEvent(0, 0, transfer));
  h.grid.fire("dragover", dragEvent(x, y, transfer));
  const drop = dragEvent(x, y, transfer);
  h.grid.fire("drop", drop);
  h.cards[from]!.fire("dragend", dragEvent(0, 0, transfer));
  return drop;
}

describe("enableCardDrag", () => {
  it("only makes the card draggable while the handle is held", () => {
    const h = harness();
    expect(h.cards[0]!.attributes.has("draggable")).toBe(false);

    h.handles[0]!.fire("pointerdown", {});
    expect(h.cards[0]!.attributes.get("draggable")).toBe("true");

    // 按下又没真的拖：必须收回 draggable，否则用户在正文里划选文字会变成拖卡片。
    // pointerup 挂在**把手**的 ownerDocument 上（手指可能松在把手外面），不是卡片的。
    h.handles[0]!.ownerDocument.fire("pointerup", {});
    expect(h.cards[0]!.attributes.has("draggable")).toBe(false);
    h.dispose();
  });

  it("ignores a dragstart that only bubbles through the card from a link in its body", () => {
    const h = harness();
    // 卡片正文里的链接本身可拖（浏览器默认行为），它的 dragstart 冒泡到卡片上。
    // 这里卡片自己没按过抓手、并不 draggable——正是漏口最原始的形状。
    const link = new FakeEl();
    link.attributes.set("draggable", "true");
    const transfer = fakeDataTransfer({ "text/uri-list": "https://example.com/" });
    const start = dragEvent(0, 0, transfer);
    start.target = link;
    h.cards[0]!.fire("dragstart", start);

    expect(h.cards[0]!.hasClass("is-dragging")).toBe(false);
    // 被挡下的这次 dragstart 一个字节都没往 dataTransfer 里写
    expect(transfer.types).toEqual(["text/uri-list"]);

    // 松在网格上：这不是卡片拖拽，既不该吞掉这次拖拽，也不该调 onDrop 改写文件
    const over = dragEvent(800, 50, transfer);
    h.grid.fire("dragover", over);
    expect(over.prevented).toBe(false);

    const drop = dragEvent(800, 50, transfer);
    h.grid.fire("drop", drop);
    expect(drop.prevented).toBe(false);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });

  it("clears the drag state on dragend", () => {
    const h = harness();
    const transfer = fakeDataTransfer();
    h.handles[0]!.fire("pointerdown", {});
    h.cards[0]!.fire("dragstart", dragEvent(0, 0, transfer));
    expect(h.cards[0]!.hasClass("is-dragging")).toBe(true);

    h.cards[0]!.fire("dragend", dragEvent(0, 0, transfer));
    expect(h.cards[0]!.hasClass("is-dragging")).toBe(false);
    h.dispose();
  });

  it("ignores drag events while it is disabled", () => {
    const grid = new FakeEl();
    grid.rect = { left: 0, top: 0, right: 1000, bottom: 500 };
    grid.clientWidth = 1000;
    const card = new FakeEl();
    card.classSet.add("home-card");
    card.rect = { left: 0, top: 0, right: 320, bottom: 100 };
    grid.children.push(card);
    const handle = new FakeEl();
    const dispose = enableCardDrag({
      cardEl: card as unknown as HTMLElement,
      handleEl: handle as unknown as HTMLElement,
      index: 0,
      isEnabled: () => false,
    });

    handle.fire("pointerdown", {});
    card.attributes.set("draggable", "true");
    const transfer = fakeDataTransfer();
    card.fire("dragstart", dragEvent(0, 0, transfer));
    // 闸门关着：不该标记拖拽态，也不该往载荷里写下标
    expect(card.hasClass("is-dragging")).toBe(false);
    expect(transfer.types).toEqual([]);
    dispose();
  });

  it("unregisters every listener on dispose", () => {
    const h = harness();
    expect(h.cards[0]!.listenerCount()).toBeGreaterThan(0);
    expect(h.grid.listenerCount()).toBeGreaterThan(0);
    h.dispose();
    for (const card of h.cards) {
      expect(card.listenerCount()).toBe(0);
    }
    expect(h.grid.listenerCount()).toBe(0);
    expect(h.handles[0]!.listenerCount()).toBe(0);
  });
});

describe("enableGridDrop", () => {
  it("takes the dragged index from the drag payload, not from the element under the pointer", () => {
    const h = harness();
    // x=800 落在第 3 列；y=40 在卡2 上半 → 插到它前面
    dragTo(h, 0, 800, 40);
    expect(h.dropped).toEqual([[0, { col: 3, indexInCol: 0 }]]);
    h.dispose();
  });

  it("reports the column under the pointer and the slot inside it", () => {
    const h = harness();
    // y=60 过了卡1 的中点（50）→ 插到它后面，也就是第 2 列的末尾
    dragTo(h, 2, 500, 60);
    expect(h.dropped).toEqual([[2, { col: 2, indexInCol: 1 }]]);
    h.dispose();
  });

  /**
   * 这是本次改造最容易被"优化"掉的一条。老代码有 `if (target !== from)` 的早退，而列布局下
   * 跨列拖动完全可能不改变笔记顺序（把某列唯一的卡片拖到另一列就是），早退会让这种拖拽
   * 静默失效：用户拖了、松手了、什么都没发生。
   */
  it("still fires onDrop when the note order would not change", () => {
    const h = harness();
    // 把卡0 拖回它自己所在列的原位
    dragTo(h, 0, 100, 40);
    expect(h.dropped).toEqual([[0, { col: 1, indexInCol: 0 }]]);
    h.dispose();
  });

  it("accepts a drop below every card, where no card sits", () => {
    const h = harness();
    // 短列底部/空白区必须可投放：只在卡片上 preventDefault 的话这里根本收不到 drop
    const drop = dragTo(h, 0, 500, 480);
    expect(drop.prevented).toBe(true);
    expect(h.dropped).toEqual([[0, { col: 2, indexInCol: 1 }]]);
    h.dispose();
  });

  it("allows the drop by preventing default on dragover over empty space", () => {
    const h = harness();
    const transfer = fakeDataTransfer();
    h.handles[0]!.fire("pointerdown", {});
    h.cards[0]!.fire("dragstart", dragEvent(0, 0, transfer));
    const over = dragEvent(500, 480, transfer);
    h.grid.fire("dragover", over);
    expect(over.prevented).toBe(true);
    h.dispose();
  });

  it("shows a single indicator and takes it away on drop", () => {
    const h = harness();
    const transfer = fakeDataTransfer();
    h.handles[0]!.fire("pointerdown", {});
    h.cards[0]!.fire("dragstart", dragEvent(0, 0, transfer));

    h.grid.fire("dragover", dragEvent(800, 40, transfer));
    h.grid.fire("dragover", dragEvent(800, 60, transfer));
    const lines = h.grid.children.filter((child) =>
      child.hasClass("home-card-drop-indicator"),
    );
    expect(lines).toHaveLength(1);

    h.grid.fire("drop", dragEvent(800, 40, transfer));
    expect(
      h.grid.children.filter((child) => child.hasClass("home-card-drop-indicator")),
    ).toHaveLength(0);
    h.dispose();
  });

  it("takes the indicator away once the pointer leaves the grid", () => {
    const h = harness();
    const transfer = fakeDataTransfer();
    h.handles[0]!.fire("pointerdown", {});
    h.cards[0]!.fire("dragstart", dragEvent(0, 0, transfer));
    h.grid.fire("dragover", dragEvent(800, 40, transfer));
    expect(
      h.grid.children.filter((child) => child.hasClass("home-card-drop-indicator")),
    ).toHaveLength(1);

    // 指针移出网格后 dragover 不再触发，最后的状态会留在屏幕上，所以要靠 dragleave 收尾
    h.grid.fire("dragleave", dragEvent(-50, -50, transfer));
    expect(
      h.grid.children.filter((child) => child.hasClass("home-card-drop-indicator")),
    ).toHaveLength(0);
    h.dispose();
  });

  it("ignores dragover and drop while no card drag is in progress", () => {
    const h = harness();
    // 从系统里拖一个文件进来（或任何非卡片拖拽）：网格不能把它当成可落点吞掉
    const foreign = fakeDataTransfer({ "text/plain": "0", "text/uri-list": "file:///tmp/a.txt" });
    const over = dragEvent(800, 40, foreign);
    h.grid.fire("dragover", over);
    expect(over.prevented).toBe(false);

    // 载荷里带一个看着合法的下标也没用：类型列表里没有我们的私有类型就不认
    const drop = dragEvent(800, 40, foreign);
    h.grid.fire("drop", drop);
    expect(drop.prevented).toBe(false);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });

  it("does not claim a later foreign drag after a card drag has ended", () => {
    // 拖拽的归属只能来自**这次 drag 自己的** dataTransfer，不能寄存在任何可变状态上：
    // 落一次卡片会触发 refreshHome → 重建卡片，源卡片被销毁，浏览器不会再对已脱离文档的
    // 节点派发 dragend。归属若留在模块级变量里，下一个外来拖拽就会继承那个过期下标。
    const h = harness();

    // 第一次：一次完整的投放，且**故意不发 dragend**（源卡片即将被销毁）
    const own = fakeDataTransfer();
    h.handles[1]!.fire("pointerdown", {});
    h.cards[1]!.fire("dragstart", dragEvent(0, 0, own));
    const drop = dragEvent(800, 40, own);
    h.grid.fire("drop", drop);
    expect(drop.prevented).toBe(true);
    expect(h.dropped).toEqual([[1, { col: 3, indexInCol: 0 }]]);

    // 第二次：从系统里拖一个文件进来，它带着自己的 dataTransfer（没有任何私有类型）
    const foreign = fakeDataTransfer({ "text/plain": "0", "text/uri-list": "file:///tmp/a.txt" });
    const overForeign = dragEvent(800, 40, foreign);
    h.grid.fire("dragover", overForeign);
    expect(overForeign.prevented).toBe(false);
    const dropForeign = dragEvent(800, 40, foreign);
    h.grid.fire("drop", dropForeign);
    expect(dropForeign.prevented).toBe(false);
    // 仍然只有第一次那一条
    expect(h.dropped).toHaveLength(1);
    h.dispose();
  });

  it("skips a payload index that no longer matches any card", () => {
    const h = harness();
    const transfer = fakeDataTransfer();
    transfer.setData("application/x-card-home-tab-card", "99");
    const drop = dragEvent(800, 40, transfer);
    h.grid.fire("drop", drop);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });
});
