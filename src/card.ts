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
let styleSheetSupport: boolean | null = null;

function supportsConstructableStyleSheets(): boolean {
  if (styleSheetSupport !== null) {
    return styleSheetSupport;
  }
  styleSheetSupport =
    typeof CSSStyleSheet === "function" &&
    "adoptedStyleSheets" in Document.prototype &&
    "replaceSync" in CSSStyleSheet.prototype;
  return styleSheetSupport;
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
    if (trimmed.length === 0 || !supportsConstructableStyleSheets()) {
      return;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(trimmed);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    this.sheet = sheet;
  }

  private detachStyles(): void {
    const sheet = this.sheet;
    if (!sheet) {
      return;
    }
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet);
    this.sheet = null;
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
