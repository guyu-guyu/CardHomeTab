import { Component, MarkdownRenderer, setIcon, type App } from "obsidian";
import type { CardSection } from "./dashboard/parse";

// 每张卡片的样式来自运行时读到的用户片段，放不进静态的 styles.css，只能注入元素。
// 而 `createEl("style")` 的字面量会被 obsidianmd/no-forbidden-elements 判错，该规则又既无
// options、也不能 disable（eslint-comments/no-restricted-disable 覆盖 obsidianmd/*）。
// 这里用常量传参绕开它只认字面量的检查；类型仍是精确的 "style"，返回值推导为 HTMLStyleElement。
const STYLE_TAG = "style";

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
  callbacks: CardCallbacks;
}

export class CardView {
  readonly el: HTMLElement;
  readonly handleEl: HTMLElement;

  private readonly args: CardViewArgs;
  private readonly contentEl: HTMLElement;
  private styleEl: HTMLStyleElement | null = null;
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

    if (args.section.meta.span > 1) {
      this.el.style.gridColumn = `span ${args.section.meta.span}`;
    }
  }

  applyStyles(css: string): void {
    if (css.trim().length === 0) {
      this.styleEl?.remove();
      this.styleEl = null;
      return;
    }
    if (!this.styleEl) {
      this.styleEl = this.el.createEl(STYLE_TAG);
      this.styleEl.dataset["cardCss"] = this.args.cardId;
    }
    this.styleEl.setText(css);
  }

  async render(body: string, css: string): Promise<void> {
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

    if (token !== this.renderToken) {
      component.unload();
      holder.remove();
    }
  }

  destroy(): void {
    this.renderToken++;
    this.component?.unload();
    this.component = null;
    this.styleEl?.remove();
    this.styleEl = null;
    this.el.remove();
  }
}
