import { afterAll, describe, expect, it, vi } from "vitest";
import { enableCardDrag } from "../src/card-grid";

/**
 * 驱动交互层（enableCardDrag）的接线，跑的是真正的监听器与索引换算，只把 DOM 换成手写替身
 * （仓库里没有 jsdom，也不想为此加依赖）。
 *
 * 这里最要紧的一条回归是「drop 事件落在指针下方的元素上，也就是目标卡片」：目标卡片的闭包
 * index 是它自己，所以被拖卡片的下标只能从 dragstart 写下的载荷里取。只信闭包 index 时，
 * computeDropIndex 在目标卡片内部永远返回它自己的槽位，target === index 恒成立，
 * onDrop 一次都不会触发——拖了等于没拖，而且不会有任何报错。
 *
 * 另有两道闸门也在这里钉住：dragstart 必须**卡片自己就是拖拽源**（正文里链接的 dragstart
 * 会冒泡到卡片上），以及 dragover / drop 只认「模块里有在途的拖拽下标」——否则从系统里
 * 拖进来的文件会被卡片当成可落点吞掉，链接拖拽甚至会变成一次真实的换序写盘。
 *
 * 在途下标是模块级状态（这样跨网格、跨窗口的拖拽才认得出自己是发起方），所以每条用例都得
 * 自己把状态收干净：一律用真实的 `dragend` 收尾，不额外引出测试专用的复位接口。
 */

type Listener = (event: unknown) => void;

/** 把手的 ownerDocument 替身：enableCardDrag 把 pointerup / pointercancel 挂在它上面，
 *  所以这里要能同时当 spy 用（断言挂了/摘了哪些）和当事件源用（手动派发 pointerup）。 */
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
  // 真元素恒有 ownerDocument（弹出窗口里是另一个 document），这里给每个替身配一个。
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

  fire(type: string, event: unknown): void {
    // 直接在元素上派发时，它就是事件源（真实 DOM 的 `event.target`）；冒泡上来的事件
    // （卡片正文里的链接）由调用方预先写好 target，这里不覆盖——src 正是靠 target 区分
    // 「卡片自己是不是拖拽源」，覆盖掉就把要钉的那条分支抹平了。
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

// cardRects 读的是全局 HTMLElement，这里把它换成替身类。用 vi.stubGlobal 而不是直接写
// globalThis：obsidianmd/no-global-this 是 --max-warnings 0 下的硬门禁，且不可 disable。
vi.stubGlobal("HTMLElement", FakeEl);
afterAll(() => {
  vi.unstubAllGlobals();
});

interface FakeDragEvent {
  clientX: number;
  clientY: number;
  prevented: boolean;
  /** 事件源。真实浏览器里 dragstart 的 target 是**拖拽源元素**：卡片自己是源时是 cardEl，
   *  正文里的链接冒泡上来时是那个链接。`fire()` 默认把它设成派发到的元素。 */
  target?: unknown;
  dataTransfer: {
    payload: string | null;
    effectAllowed: string;
    setData(format: string, value: string): void;
    getData(format: string): string;
  };
  preventDefault(): void;
}

function dragEvent(clientX: number, clientY: number, payload: string | null = null): FakeDragEvent {
  return {
    clientX,
    clientY,
    prevented: false,
    dataTransfer: {
      payload,
      effectAllowed: "",
      setData(_format, value) {
        this.payload = value;
      },
      getData() {
        return this.payload ?? "";
      },
    },
    preventDefault() {
      this.prevented = true;
    },
  };
}

interface Harness {
  grid: FakeEl;
  cards: FakeEl[];
  handles: FakeEl[];
  dropped: Array<[number, number]>;
  dispose(): void;
}

/** 一行三张卡片，几何与 drop-index 用例一致：每张 100 宽、中线 50/150/250。 */
function harness(): Harness {
  const grid = new FakeEl();
  const cards: FakeEl[] = [];
  const handles: FakeEl[] = [];
  const dropped: Array<[number, number]> = [];
  const disposers: Array<() => void> = [];

  for (let i = 0; i < 3; i++) {
    const card = new FakeEl();
    card.classSet.add("home-card");
    card.rect = { left: i * 100, top: 0, right: i * 100 + 100, bottom: 100 };
    grid.children.push(card);
    cards.push(card);

    const handle = new FakeEl();
    handles.push(handle);

    disposers.push(
      enableCardDrag({
        gridEl: grid as unknown as HTMLElement,
        cardEl: card as unknown as HTMLElement,
        handleEl: handle as unknown as HTMLElement,
        index: i,
        onDrop: (from, to) => dropped.push([from, to]),
        isEnabled: () => true,
      }),
    );
  }

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

/** 完整跑一次手势：按被拖卡片的抓手，拖起来，落在目标卡片的 (x, y) 上，再松手。 */
function dragOnto(
  h: Harness,
  from: number,
  to: number,
  x: number,
  y: number,
): FakeDragEvent {
  h.handles[from]!.fire("pointerdown", {});
  const start = dragEvent(0, 0);
  h.cards[from]!.fire("dragstart", start);
  h.cards[to]!.fire("dragover", dragEvent(x, y));
  const drop = dragEvent(x, y, start.dataTransfer.payload);
  h.cards[to]!.fire("drop", drop);
  h.cards[from]!.fire("dragend", dragEvent(0, 0));
  return drop;
}

describe("enableCardDrag", () => {
  it("only makes the card draggable while the handle is held", () => {
    const h = harness();
    expect(h.cards[0]!.attributes.has("draggable")).toBe(false);

    h.handles[0]!.fire("pointerdown", {});
    expect(h.cards[0]!.attributes.get("draggable")).toBe("true");

    h.cards[0]!.fire("dragstart", dragEvent(0, 0));
    // 拖拽进行中松手不算收尾：draggable 要留着，收尾归 dragend 管
    h.handles[0]!.ownerDocument.fire("pointerup", {});
    expect(h.cards[0]!.attributes.get("draggable")).toBe("true");

    h.cards[0]!.fire("dragend", dragEvent(0, 0));
    expect(h.cards[0]!.attributes.has("draggable")).toBe(false);

    // 松手后再拖一次：没有重新按抓手就不能开始拖拽（正文里的文字才选得中）
    h.cards[0]!.fire("dragstart", dragEvent(0, 0));
    expect(h.cards[0]!.hasClass("is-dragging")).toBe(false);
    h.dispose();
  });

  it("takes the dragged index from the drag payload, not from the card that receives the drop", () => {
    const h = harness();
    dragOnto(h, 0, 2, 290, 50);
    expect(h.dropped).toEqual([[0, 2]]);
    h.dispose();
  });

  it("moves a card to the slot before the card it is dropped on", () => {
    const h = harness();
    dragOnto(h, 2, 0, 10, 50);
    expect(h.dropped).toEqual([[2, 0]]);
    h.dispose();
  });

  it("does nothing when the card is dropped onto itself", () => {
    const h = harness();
    dragOnto(h, 0, 0, 60, 50);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });

  it("does nothing when a card is dropped back into its own slot", () => {
    const h = harness();
    dragOnto(h, 0, 1, 110, 50);
    dragOnto(h, 1, 0, 60, 50);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });

  it("ignores a dragstart that only bubbles through the card from a link in its body", () => {
    const h = harness();
    // 卡片正文里的链接本身可拖（浏览器默认行为），它的 dragstart 冒泡到卡片上。
    // 这里卡片自己没按过抓手、并不 draggable——正是漏口最原始的形状。
    const link = new FakeEl();
    link.attributes.set("draggable", "true");
    const start = dragEvent(0, 0);
    start.target = link;
    h.cards[0]!.fire("dragstart", start);

    expect(h.cards[0]!.hasClass("is-dragging")).toBe(false);
    expect(start.dataTransfer.payload).toBeNull();

    // 松在另一张卡片上：这不是卡片拖拽，既不该吞掉这次拖拽，也不该调 onDrop 改写文件
    const over = dragEvent(290, 50);
    h.cards[2]!.fire("dragover", over);
    expect(over.prevented).toBe(false);

    const drop = dragEvent(290, 50, start.dataTransfer.payload);
    h.cards[2]!.fire("drop", drop);
    expect(drop.prevented).toBe(false);
    expect(h.dropped).toEqual([]);

    // 真实浏览器里链接拖拽收尾也会在拖拽源上派发 dragend（冒泡到卡片），这里照做：
    // 既走的是真实代码路径，也保证这次手势不给后面的用例留下模块级的在途下标。
    h.cards[0]!.fire("dragend", dragEvent(0, 0));
    h.dispose();
  });

  it("ignores dragover and drop while no card drag is in progress", () => {
    const h = harness();
    // 从系统里拖一个文件进来（或任何非卡片拖拽）：卡片不能被当成可落点吞掉
    const over = dragEvent(290, 50);
    h.cards[2]!.fire("dragover", over);
    expect(over.prevented).toBe(false);

    // 载荷里带一个看着合法的下标也没用：模块里没有在途下标就不认
    const drop = dragEvent(290, 50, "0");
    h.cards[2]!.fire("drop", drop);
    expect(drop.prevented).toBe(false);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });

  it("clears the drag state on dragend", () => {
    const h = harness();
    h.handles[0]!.fire("pointerdown", {});
    h.cards[0]!.fire("dragstart", dragEvent(0, 0));
    // 拖拽在途：我们自己的 dragover 要被放行，下面 dragend 之后同一次观察必须翻过来
    const over = dragEvent(290, 50);
    h.cards[2]!.fire("dragover", over);
    expect(over.prevented).toBe(true);
    expect(h.cards[0]!.hasClass("is-dragging")).toBe(true);

    h.cards[0]!.fire("dragend", dragEvent(0, 0));
    expect(h.cards[0]!.hasClass("is-dragging")).toBe(false);

    // 收尾之后在途下标已清掉：同样的 dragover / drop 不再被认领，也不会调 onDrop
    const overAfter = dragEvent(290, 50);
    h.cards[2]!.fire("dragover", overAfter);
    expect(overAfter.prevented).toBe(false);

    const dropAfter = dragEvent(290, 50, "0");
    h.cards[2]!.fire("drop", dropAfter);
    expect(dropAfter.prevented).toBe(false);
    expect(h.dropped).toEqual([]);
    h.dispose();
  });

  it("unregisters every listener on dispose", () => {
    const h = harness();
    const doc = h.handles[0]!.ownerDocument;
    expect(h.handles[0]!.listenerCount()).toBe(1);
    expect(h.cards[0]!.listenerCount()).toBe(4);
    // pointerup / pointercancel 挂在把手自己的 document 上（不在把手、也不在卡片上）
    expect(doc.addEventListener.mock.calls.map(([type]) => type)).toEqual([
      "pointerup",
      "pointercancel",
    ]);

    h.dispose();
    expect(h.handles[0]!.listenerCount()).toBe(0);
    expect(h.cards[0]!.listenerCount()).toBe(0);
    // 摘掉的必须与挂上的是同一批：类型与函数引用都对得上
    expect(doc.removeEventListener.mock.calls).toEqual(doc.addEventListener.mock.calls);

    // 拆掉之后事件不能再产生任何效果
    dragOnto(h, 0, 2, 290, 50);
    expect(h.dropped).toEqual([]);
    expect(h.cards[0]!.attributes.has("draggable")).toBe(false);
  });

  it("ignores drag events while it is disabled", () => {
    const grid = new FakeEl();
    const cards = [0, 1].map((i) => {
      const card = new FakeEl();
      card.classSet.add("home-card");
      card.rect = { left: i * 100, top: 0, right: i * 100 + 100, bottom: 100 };
      grid.children.push(card);
      return card;
    });
    const handle = new FakeEl();
    const dropped: Array<[number, number]> = [];
    let enabled = false;

    for (const i of [0, 1]) {
      enableCardDrag({
        gridEl: grid as unknown as HTMLElement,
        cardEl: cards[i]! as unknown as HTMLElement,
        handleEl: i === 0 ? (handle as unknown as HTMLElement) : (new FakeEl() as unknown as HTMLElement),
        index: i,
        onDrop: (from, to) => dropped.push([from, to]),
        isEnabled: () => enabled,
      });
    }

    handle.fire("pointerdown", {});
    const start = dragEvent(190, 50);
    cards[0]!.fire("dragstart", start);
    // 禁用分支与「外来拖拽」共用同一个提前返回，不再 preventDefault：它表达的是
    // 「这次拖拽不归我们管」，而不是「把它取消掉」。
    expect(start.prevented).toBe(false);
    expect(cards[0]!.hasClass("is-dragging")).toBe(false);

    const overDisabled = dragEvent(190, 50);
    cards[1]!.fire("dragover", overDisabled);
    expect(overDisabled.prevented).toBe(false);

    const dropDisabled = dragEvent(190, 50, "0");
    cards[1]!.fire("drop", dropDisabled);
    expect(dropDisabled.prevented).toBe(false);
    expect(dropped).toEqual([]);

    // 解禁后同一次手势应当照常生效
    enabled = true;
    // 解禁了但还没有卡片拖拽在途（模块里没有在途下标）：仍然不是可落点
    const overIdle = dragEvent(190, 50);
    cards[1]!.fire("dragover", overIdle);
    expect(overIdle.prevented).toBe(false);

    const start2 = dragEvent(0, 0);
    cards[0]!.fire("dragstart", start2);
    // 这次才是我们自己的拖拽，dragover 必须放行 drop
    const over = dragEvent(190, 50);
    cards[1]!.fire("dragover", over);
    expect(over.prevented).toBe(true);

    cards[1]!.fire("drop", dragEvent(190, 50, start2.dataTransfer.payload));
    expect(dropped).toEqual([[0, 1]]);

    // 收干净：在途下标是模块级状态，留着会漏给后面的用例
    cards[0]!.fire("dragend", dragEvent(0, 0));
  });
});
