import { MarkdownView, Notice, Plugin } from "obsidian";
import { DashboardStore } from "./dashboard/io";
import {
  appendCard as appendCardInText,
  removeCard as removeCardInText,
} from "./dashboard/edit";
import { DEFAULT_CARD_META } from "./dashboard/metadata";
import type { CardSection } from "./dashboard/parse";
import { errorMessage } from "./errors";
import { HOME_VIEW_TYPE, HomeView } from "./home-view";
import { DEFAULT_SETTINGS, mergeSettings, type CardHomeTabSettings } from "./settings";
import { SnippetRegistry } from "./snippets";

export default class CardHomeTabPlugin extends Plugin {
  settings: CardHomeTabSettings = { ...DEFAULT_SETTINGS, recentFiles: [] };
  store!: DashboardStore;
  snippets!: SnippetRegistry;

  private selfWriting = false;
  private unloaded = false;
  private replacingLeaf = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new DashboardStore(this.app, () => this.settings);
    this.snippets = new SnippetRegistry(this.app);

    this.registerView(HOME_VIEW_TYPE, (leaf) => new HomeView(leaf, this));

    this.addCommand({
      id: "open-home",
      name: "打开首页",
      callback: () => {
        void this.openHome();
      },
    });

    this.addCommand({
      id: "refresh-cards",
      name: "刷新所有卡片",
      callback: () => {
        this.refreshHome();
      },
    });

    this.addCommand({
      id: "open-dashboard-note",
      name: "在标签页打开仪表盘",
      callback: () => {
        void this.openDashboardNote();
      },
    });

    this.addCommand({
      id: "new-card",
      name: "新建卡片",
      callback: () => {
        void this.addCard();
      },
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.maybeReplaceEmptyLeaf();
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.selfWriting || file.path !== this.store.path) {
          return;
        }
        this.refreshHome();
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded || !this.settings.openOnStartup) {
        return;
      }
      void this.openHome();
    });
  }

  onunload(): void {
    this.unloaded = true;
  }

  async openHome(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
  }

  async openDashboardNote(): Promise<void> {
    if (!(await this.ensureDashboardFile())) {
      return;
    }
    await this.app.workspace.openLinkText(this.store.path, "", false);
  }

  refreshHome(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)) {
      if (leaf.view instanceof HomeView) {
        void leaf.view.render();
      }
    }
  }

  async markSelfWriting<T>(action: () => Promise<T>): Promise<T> {
    this.selfWriting = true;
    try {
      return await action();
    } finally {
      const timer = window.setTimeout(() => {
        this.selfWriting = false;
      }, 350);
      this.register(() => window.clearTimeout(timer));
    }
  }

  /** Task 10 的「新建卡片」命令与卡片菜单会调用这两个方法；先接上是因为 `process()`
   *  是唯一会抛的成员，它的失败必须以 Notice 呈现，而不是留下未处理的 rejection。 */
  async addCard(): Promise<void> {
    if (!(await this.ensureDashboardFile())) {
      return;
    }
    const title = `新卡片 ${new Date().toLocaleDateString()}`;
    const written = await this.writeDashboard((text) =>
      appendCardInText(text, this.settings.cardHeadingLevel, title, DEFAULT_CARD_META, ""),
    );
    if (!written) {
      return;
    }
    this.refreshHome();
  }

  async removeCard(section: CardSection): Promise<void> {
    const written = await this.writeDashboard((text) => removeCardInText(text, section));
    if (!written) {
      return;
    }
    this.refreshHome();
  }

  async editCard(section: CardSection): Promise<void> {
    await this.openDashboardNote();
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return;
    }
    const line = view.editor.offsetToPos(section.start).line;
    view.editor.setCursor({ line, ch: 0 });
    view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
  }

  openCardSettings(section: CardSection): void {
    new Notice(`卡片设置将在后续接入：${section.title}`);
  }

  private async writeDashboard(mutate: (text: string) => string): Promise<boolean> {
    try {
      await this.markSelfWriting(async () => {
        await this.store.process(mutate);
      });
      return true;
    } catch (error) {
      new Notice(`CardHomeTab: 写入仪表盘失败：${errorMessage(error)}`);
      return false;
    }
  }

  /** `create()` 在目标路径被同名文件或文件夹占住时会拒绝；这里把拒绝映射成 Notice，
   *  返回是否已存在可用的仪表盘文件。 */
  private async ensureDashboardFile(): Promise<boolean> {
    if (this.store.exists()) {
      return true;
    }
    try {
      await this.store.create();
      return true;
    } catch (error) {
      new Notice(`CardHomeTab: 无法创建仪表盘文件 ${this.store.path}：${errorMessage(error)}`);
      return false;
    }
  }

  private maybeReplaceEmptyLeaf(): void {
    if (this.replacingLeaf || !this.settings.replaceNewTabs) {
      return;
    }
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf || leaf.view.getViewType() !== "empty") {
      return;
    }
    this.replacingLeaf = true;
    void leaf
      .setViewState({ type: HOME_VIEW_TYPE, active: true })
      .finally(() => {
        this.replacingLeaf = false;
      });
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
