import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { errorMessage } from "./errors";
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
    return "卡片首页";
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
    root.createDiv({ cls: "home-tab-placeholder", text: "卡片区域尚未接入" });
  }

  private renderMissingFile(root: HTMLElement): void {
    const notice = root.createDiv({ cls: "home-tab-missing" });
    notice.createEl("p", { text: `没有找到仪表盘文件：${this.plugin.store.path}` });
    const button = notice.createEl("button", { text: "创建并打开" });
    button.addEventListener("click", () => {
      void (async () => {
        // openDashboardNote() 自己就会在文件缺失时创建它，这里不必再调一次 create()。
        // openLinkText 仍可能拒绝；不接住就只剩控制台里的 unhandled rejection。
        try {
          await this.plugin.openDashboardNote();
          if (this.plugin.store.exists()) {
            await this.render();
          }
        } catch (error) {
          new Notice(
            `CardHomeTab: 无法创建或打开仪表盘文件 ${this.plugin.store.path}：${errorMessage(error)}`,
          );
        }
      })();
    });
  }
}
