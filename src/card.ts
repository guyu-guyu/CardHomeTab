import { Component, MarkdownRenderer, setIcon, type App } from "obsidian";
import { enableCardDrag } from "./card-grid";
import type { CardSection } from "./dashboard/parse";

/**
 * 卡片样式只能运行时注入（内容由用户片段文件与每卡 %%card:%% 元数据生成），
 * 没法放进静态的 styles.css；而 `obsidianmd/no-forbidden-elements` 明确禁止创建
 * `<style>` 元素。所以改用可构造样式表 + adoptedStyleSheets：不创建任何元素，
 * 符合规则的意图与字面。
 *
 * 平台下限不会因此抬高：卡片样式本身就依赖 `@scope`（Chromium 118+ / Safari 17.2+），
 * 而 adoptedStyleSheets 从 Chromium 73+ / Safari 16.4+ 就可用——凡是支持 `@scope` 的
 * 环境都支持它。这个探测仍然保留，作为老环境的降级开关：不支持时只跳过样式注入，
 * 卡片照常渲染，不抛异常。
 */
// popout 窗口是另一个 window，`CSSStyleSheet` / `Document` 构造器挂在它自己身上；
// 用类型查询取到全局类的类型（不写 `globalThis`，那会撞 obsidianmd/no-global-this）。
type StyleSheetWindow = Window & {
  CSSStyleSheet: typeof CSSStyleSheet;
  Document: typeof Document;
};

// 按 window 缓存而不是单个模块级布尔：popout 窗口是另一个 window，能力探测要各算各的。
const styleSheetSupport = new WeakMap<Window, boolean>();

function supportsConstructableStyleSheets(win: Window): boolean {
  const cached = styleSheetSupport.get(win);
  if (cached !== undefined) {
    return cached;
  }
  const scoped = win as StyleSheetWindow;
  const supported =
    typeof scoped.CSSStyleSheet === "function" &&
    "adoptedStyleSheets" in scoped.Document.prototype &&
    "replaceSync" in scoped.CSSStyleSheet.prototype;
  styleSheetSupport.set(win, supported);
  return supported;
}

export interface CardCallbacks {
  onEdit(section: CardSection): void;
  onRemove(section: CardSection): void;
  onSettings(section: CardSection): void;
}

export interface CardViewArgs {
  app: App;
  section: CardSection;
  dashboardPath: string;
  cardId: string;
  index: number;
  /** 当前网格的列数；span 超过它会产生隐式列并撑破网格，所以在这里夹住。 */
  maxSpan: number;
  gridEl: HTMLElement;
  callbacks: CardCallbacks;
  onDrop: (from: number, to: number) => void;
}

export class CardView {
  readonly el: HTMLElement;
  readonly handleEl: HTMLElement;
  dragEnabled = true;

  private readonly args: CardViewArgs;
  private readonly contentEl: HTMLElement;
  private disposeDrag: () => void = () => undefined;
  private sheet: CSSStyleSheet | null = null;
  private sheetDoc: Document | null = null;
  private destroyed = false;
  private component: Component | null = null;
  private renderToken = 0;

  constructor(args: CardViewArgs) {
    this.args = args;
    this.el = createDiv({ cls: "home-card" });
    this.el.dataset["cardId"] = args.cardId;

    const header = this.el.createDiv({ cls: "home-card-header" });
    if (args.section.meta.icon.length > 0) {
      setIcon(header.createSpan({ cls: "home-card-icon" }), args.section.meta.icon);
    }
    header.createSpan({ cls: "home-card-title", text: args.section.title });

    const actions = header.createDiv({ cls: "home-card-actions" });
    this.handleEl = actions.createSpan({ cls: "home-card-handle" });
    setIcon(this.handleEl, "lucide-grip-vertical");

    const settingsButton = actions.createSpan({ cls: "home-card-action" });
    setIcon(settingsButton, "lucide-settings-2");
    settingsButton.addEventListener("click", () => args.callbacks.onSettings(args.section));

    const editButton = actions.createSpan({ cls: "home-card-action" });
    setIcon(editButton, "lucide-pencil");
    editButton.addEventListener("click", () => args.callbacks.onEdit(args.section));

    const removeButton = actions.createSpan({ cls: "home-card-action" });
    setIcon(removeButton, "lucide-trash-2");
    removeButton.addEventListener("click", () => args.callbacks.onRemove(args.section));

    const content = this.el.createDiv({ cls: "home-card-content" });
    content.addClass("markdown-rendered");
    this.contentEl = content;

    const span = Math.min(args.section.meta.span, args.maxSpan);
    if (span > 1) {
      this.el.style.gridColumn = `span ${span}`;
    }

    this.disposeDrag = enableCardDrag({
      gridEl: args.gridEl,
      cardEl: this.el,
      handleEl: this.handleEl,
      index: args.index,
      onDrop: args.onDrop,
      isEnabled: () => this.dragEnabled,
    });
  }

  applyStyles(css: string): void {
    if (this.destroyed) {
      return;
    }
    this.detachStyles();
    const trimmed = css.trim();
    if (trimmed.length === 0) {
      return;
    }
    // 用卡片所在文档而不是全局 document：视图被「移到新窗口」后卡片属于 popout 文档，
    // 样式表必须挂到那个文档、且用那个 window 的 CSSStyleSheet 构造，否则 @scope 选择器
    // 在 popout 里一条都匹配不上（样式静默失效）。与 card-grid 用 ownerDocument 的做法一致。
    // applyStyles 只在 el 已挂进 grid 之后（home-view 先 appendChild 再 render）被调用，
    // 所以此刻 ownerDocument 已是最终那个文档。
    const doc = this.el.ownerDocument;
    const win = doc.defaultView;
    if (!win || !supportsConstructableStyleSheets(win)) {
      return;
    }
    const sheet = new (win as StyleSheetWindow).CSSStyleSheet();
    sheet.replaceSync(trimmed);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    this.sheet = sheet;
    this.sheetDoc = doc;
  }

  private detachStyles(): void {
    const sheet = this.sheet;
    const doc = this.sheetDoc;
    if (!sheet || !doc) {
      return;
    }
    // 从当初挂上去的那个文档移除，而不是现时的 ownerDocument：卡片可能已在窗口间移动，
    // 用现时文档会漏删、在旧文档里留下一张孤儿样式表。
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((item) => item !== sheet);
    this.sheet = null;
    this.sheetDoc = null;
  }

  async render(body: string, css: string): Promise<void> {
    if (this.destroyed) {
      return;
    }
    const token = ++this.renderToken;
    this.component?.unload();
    this.component = null;
    this.contentEl.empty();
    this.applyStyles(css);

    const holder = this.contentEl.createDiv({ cls: "home-card-content-inner" });
    const component = new Component();
    component.load();
    this.component = component;

    await MarkdownRenderer.render(
      this.args.app,
      body,
      holder,
      this.args.dashboardPath,
      component,
    );

    if (token !== this.renderToken || this.destroyed) {
      if (this.component === component) {
        this.component = null;
      }
      component.unload();
      holder.remove();
      if (this.destroyed) {
        this.detachStyles();
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.renderToken++;
    this.component?.unload();
    this.component = null;
    this.detachStyles();
    this.disposeDrag();
    this.el.remove();
  }
}
