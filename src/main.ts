import { MarkdownView, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { CardSettingsModal } from "./card-settings";
import { DashboardStore } from "./dashboard/io";
import {
  appendCard as appendCardInText,
  moveCard as moveCardInText,
  removeCard as removeCardInText,
  updateCardMeta as updateCardMetaInText,
} from "./dashboard/edit";
import { DEFAULT_CARD_META, hasLossyTokens, type CardMeta } from "./dashboard/metadata";
import { isSameSection, parseDashboard, type CardSection } from "./dashboard/parse";
import { errorMessage } from "./errors";
import { HOME_VIEW_TYPE, HomeView } from "./home-view";
import { rememberRecentFile } from "./search-bar";
import { DEFAULT_SETTINGS, mergeSettings, type CardHomeTabSettings } from "./settings";
import { SnippetRegistry } from "./snippets";

export default class CardHomeTabPlugin extends Plugin {
  settings: CardHomeTabSettings = { ...DEFAULT_SETTINGS, recentFiles: [] };
  store!: DashboardStore;
  snippets!: SnippetRegistry;

  private selfWriting = false;
  private selfWriteTimer: number | null = null;
  private unloaded = false;
  private replacingLeaf: WorkspaceLeaf | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new DashboardStore(this.app, () => this.settings);
    this.snippets = new SnippetRegistry(this.app);

    this.registerView(HOME_VIEW_TYPE, (leaf) => new HomeView(leaf, this));

    this.register(() => {
      if (this.selfWriteTimer !== null) {
        window.clearTimeout(this.selfWriteTimer);
      }
    });

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

    this.registerEvent(
      this.app.workspace.on("css-change", () => {
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
    if (this.unloaded) {
      return;
    }
    const existing = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
  }

  async openDashboardNote(): Promise<void> {
    const ready = await this.ensureDashboardFile();
    if (!ready || this.unloaded) {
      return;
    }
    await this.app.workspace.openLinkText(this.store.path, "", false);
  }

  /** home-view 是用 `void this.plugin.openSearchResult(...)` 调本方法的，裸抛只会留下未处理的
   *  rejection、点击看上去像没反应；按 `writeDashboard` 的既有做法把它收成 Notice，写盘失败
   *  则和 `writeDashboard` 返回 false 一样中止后续打开。 */
  async openSearchResult(path: string, newLeaf: boolean): Promise<void> {
    this.settings.recentFiles = rememberRecentFile(this.settings, path);
    try {
      await this.saveSettings();
      if (newLeaf) {
        await this.app.workspace.openLinkText(path, "", "tab");
      } else {
        await this.app.workspace.openLinkText(path, "", false);
      }
    } catch (error) {
      new Notice(`CardHomeTab: 无法打开 ${path}：${errorMessage(error)}`);
    }
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
      if (this.selfWriteTimer !== null) {
        window.clearTimeout(this.selfWriteTimer);
      }
      this.selfWriteTimer = window.setTimeout(() => {
        this.selfWriting = false;
        this.selfWriteTimer = null;
      }, 350);
    }
  }

  /** 「新建卡片」命令在 `onload` 里注册，会调用 `addCard`；Task 10 只需把卡片菜单接到
   *  `removeCard` / `editCard` / `openCardSettings`。三个写操作都经 `writeDashboard()`，
   *  因为 `process()` 是唯一会抛的成员，它的失败必须以 Notice 呈现，而不是留下未处理的
   *  rejection；`editCard` 不写文件，`openCardSettings` 只负责开弹窗，写盘发生在用户点
   *  「应用」后的 `applyCardMeta`，文件的创建由 `ensureDashboardFile()` 负责。 */
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
    const sections = await this.store.sections();
    const current = sections.find((candidate) => candidate.start === section.start);
    if (!current || !isSameSection(section, current)) {
      new Notice("这张卡片已经不存在了，可能文件已被改动");
      return;
    }
    const written = await this.writeDashboard((text) => removeCardInText(text, current));
    if (!written) {
      return;
    }
    this.refreshHome();
  }

  async moveCard(from: number, to: number): Promise<void> {
    const sections = await this.store.sections();
    const last = sections.length - 1;
    if (from === to || from < 0 || to < 0 || from > last || to > last) {
      return;
    }
    // 走 writeDashboard 而不是裸 process：io.ts 的 process() 在文件缺失时会抛，
    // 而 home-view 是 `void this.plugin.moveCard(...)` 调用，裸抛只会留下未处理的 rejection。
    const written = await this.writeDashboard((text) => moveCardInText(text, sections, from, to));
    if (!written) {
      return;
    }
    this.refreshHome();
  }

  async editCard(section: CardSection): Promise<void> {
    try {
      await this.openDashboardNote();
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        return;
      }
      if (view.getMode() === "preview") {
        await view.setState({ ...view.getState(), mode: "source" }, { history: false });
      }
      const editor = view.editor;
      const line = editor.offsetToPos(section.start).line;
      editor.setCursor({ line, ch: 0 });
      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    } catch (error) {
      new Notice(`无法定位到卡片：${errorMessage(error)}`);
    }
  }

  openCardSettings(section: CardSection): void {
    new CardSettingsModal({
      app: this.app,
      section,
      snippets: this.snippets,
      onApply: (meta) => {
        void this.applyCardMeta(section, meta);
      },
    }).open();
  }

  /** 弹窗是拿「打开那一刻的 section」算出来的 meta，用户可能在这中间改了文件——卡片甚至
   *  可能已被删除或改标题。所以按 `start` 在当前文本里重新找一次，并用 `isSameSection` 确认还是
   *  同一张卡：对不上就只提示、不写盘（写下去会改错卡片，甚至覆盖别人手写的 `%%card: %%`）。
   *  确认通过后用新的 section 偏移去改，而不是弹窗手里的旧值。
   *
   *  写盘走 `writeDashboard` 而不是裸 `store.process`：`process()` 在文件缺失时会抛，
   *  而 `onApply` 是 `void` 调用，裸抛只会留下未处理的 rejection（同 `moveCard` 的既有约定）。*/
  async applyCardMeta(section: CardSection, meta: CardMeta): Promise<void> {
    const text = await this.store.read();
    if (text === null) {
      new Notice("没有找到仪表盘文件");
      return;
    }
    const sections = parseDashboard(text, this.settings.cardHeadingLevel);
    const current = sections.find((candidate) => candidate.start === section.start);
    if (!current || !isSameSection(section, current)) {
      new Notice("这张卡片已经不存在了，可能文件已被改动");
      return;
    }
    // 写盘是整行替换，所以解析阶段丢掉的东西会变成真的丢字。先确认这一行能被
    // 无损表示，否则宁愿不写——用户什么都没改就丢手写内容是最不该发生的事。
    if (current.metaRange) {
      const rawLine = text.slice(current.metaRange.start, current.metaRange.end);
      if (hasLossyTokens(rawLine)) {
        new Notice(
          "这张卡片的 %%card: 行含有插件无法表示的内容（值里带分号、缺少 = 的片段、或重复的键），" +
            "为避免覆盖你手写的内容已放弃保存。请先手工调整该行。",
        );
        return;
      }
    }
    const written = await this.writeDashboard((t) => updateCardMetaInText(t, current, meta));
    if (!written) {
      return;
    }
    this.refreshHome();
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
    if (!this.settings.replaceNewTabs) {
      return;
    }
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf || leaf.view.getViewType() !== "empty") {
      return;
    }
    if (this.replacingLeaf === leaf) {
      return;
    }
    this.replacingLeaf = leaf;
    void leaf
      .setViewState({ type: HOME_VIEW_TYPE, active: true })
      .finally(() => {
        if (this.replacingLeaf === leaf) {
          this.replacingLeaf = null;
        }
      });
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
