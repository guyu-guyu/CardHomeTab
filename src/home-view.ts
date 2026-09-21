import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type CardHomeTabPlugin from "./main";

export const HOME_VIEW_TYPE = "card-home-tab-view";

export class HomeView extends ItemView {
  private readonly plugin: CardHomeTabPlugin;
  private rootEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CardHomeTabPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return HOME_VIEW_TYPE;
  }

  getDisplayText(): string {
    // 标签页标题是 UI 文案，Obsidian 的 sentence-case 规则不接受句首的 CamelCase
    // （"CardHomeTab" 会被判成 "Cardhometab"），且该规则被 eslint-comments 禁止
    // 用 disable 注释绕过，所以这里改写成句子式；插件名本身仍以 manifest.json 为准。
    return "Card home tab";
  }

  getIcon(): string {
    return "lucide-layout-dashboard";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("home-tab-view-content");
    this.rootEl = this.contentEl.createDiv({ cls: "home-tab-root" });
    await this.render();
  }

  async onClose(): Promise<void> {
    this.rootEl = null;
    this.contentEl.empty();
  }

  async render(): Promise<void> {
    const root = this.rootEl;
    if (!root) {
      return;
    }
    root.empty();
    if (!this.plugin.store.exists()) {
      this.renderMissingFile(root);
      return;
    }
    root.createDiv({ cls: "home-tab-placeholder", text: "卡片区域将在 Task 10 接入" });
  }

  private renderMissingFile(root: HTMLElement): void {
    const notice = root.createDiv({ cls: "home-tab-missing" });
    notice.createEl("p", { text: `没有找到仪表盘文件：${this.plugin.store.path}` });
    const button = notice.createEl("button", { text: "创建并打开" });
    button.addEventListener("click", () => {
      void (async () => {
        // create() 会在目标路径被同名文件或文件夹占住时拒绝；不接住就只剩控制台里的
        // unhandled rejection，界面上没有任何提示。
        try {
          await this.plugin.store.create();
          await this.plugin.openDashboardNote();
          await this.render();
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          new Notice(`CardHomeTab: 无法创建或打开仪表盘文件 ${this.plugin.store.path}：${reason}`);
        }
      })();
    });
  }
}
