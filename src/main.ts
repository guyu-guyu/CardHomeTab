import { MarkdownView, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { CardSettingsModal } from "./card-settings";
import { ConfirmModal } from "./confirm";
import { defaultDashboard } from "./dashboard/default-content";
import { DashboardStore } from "./dashboard/io";
import {
  appendCard as appendCardInText,
  applyColumnDrop,
  removeCard as removeCardInText,
  updateCardMeta as updateCardMetaInText,
} from "./dashboard/edit";
import { DEFAULT_CARD_META, hasLossyTokens, type CardMeta } from "./dashboard/metadata";
import type { DropTarget } from "./card-grid";
import { isSameSection, parseDashboard, type CardSection } from "./dashboard/parse";
import { errorMessage } from "./errors";
import { HOME_VIEW_TYPE, HomeView } from "./home-view";
import { rememberRecentFile } from "./search-bar";
import { DEFAULT_SETTINGS, mergeSettings, type CardHomeTabSettings } from "./settings";
import { CardHomeTabSettingTab } from "./settings-tab";
import { SnippetRegistry } from "./snippets";

export default class CardHomeTabPlugin extends Plugin {
  settings: CardHomeTabSettings = { ...DEFAULT_SETTINGS, recentFiles: [] };
  store!: DashboardStore;
  snippets!: SnippetRegistry;

  private selfWriting = false;
  private selfWriteTimer: number | null = null;
  private refreshTimer: number | null = null;
  private refreshFullPage = false;
  private unloaded = false;
  private replacingLeaf: WorkspaceLeaf | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new DashboardStore(this.app, () => this.settings);
    this.snippets = new SnippetRegistry(this.app);

    this.registerView(HOME_VIEW_TYPE, (leaf) => new HomeView(leaf, this));

    this.addSettingTab(new CardHomeTabSettingTab(this.app, this));

    this.register(() => {
      if (this.selfWriteTimer !== null) {
        window.clearTimeout(this.selfWriteTimer);
      }
      if (this.refreshTimer !== null) {
        window.clearTimeout(this.refreshTimer);
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
        this.refreshHomeCards();
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
        // 变成 async 了（要先等仪表盘文件创建完），所以必须接住它的 promise，
        // 否则创建失败会留下一条 unhandled rejection
        void this.maybeReplaceEmptyLeaf();
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.selfWriting || file.path !== this.store.path) {
          return;
        }
        this.refreshHomeCards();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.refreshHomeCards();
      }),
    );

    // 视图被「移到新窗口」或 popout 关闭移回时，卡片 DOM 会 re-parent 到另一个 document，
    // 但每卡片的 scoped 样式表是 document 级的（adoptedStyleSheets），不会跟着元素跨文档，
    // popout 里卡片会掉样式。这两个事件触发一次重渲染，让 render() 按卡片当前的
    // ownerDocument 重新挂表。延后一拍（setTimeout 0）是等 Obsidian 把叶子 DOM 真正
    // 移进新窗口后再渲染，否则会渲染到还没换过去的旧文档上。
    const refreshAfterMove = (): void => {
      window.setTimeout(() => this.refreshHome(), 0);
    };
    this.registerEvent(this.app.workspace.on("window-open", refreshAfterMove));
    this.registerEvent(this.app.workspace.on("window-close", refreshAfterMove));

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
    if (this.unloaded) {
      return;
    }
    try {
      this.settings.recentFiles = rememberRecentFile(this.settings, path);
      await this.saveSettings();
      await this.app.workspace.openLinkText(path, "", newLeaf ? "tab" : false);
    } catch (error) {
      new Notice(`无法打开笔记：${errorMessage(error)}`);
    }
  }

  /** 整页刷新：设置变更、popout 往返。会重建背景、logo 与搜索框。 */
  refreshHome(): void {
    this.scheduleRefresh(true);
  }

  /**
   * 只重建卡片网格：笔记与片段变更走这条。背景、logo、搜索框原地不动，
   * 因此拖动卡片之后整页不再闪一下。
   */
  refreshHomeCards(): void {
    this.scheduleRefresh(false);
  }

  /**
   * 把同一 tick 内的多次刷新合并成一次。
   *
   * 只用一个计时器 + 一个"整页优先"标志，不要开两个：两个 pending 同时存在时先后顺序不定，
   * 整页那次可能落在后面，把刚做完的卡片刷新整个重做一遍。
   *
   * 用 `window.setTimeout(0)` 而不是 `requestAnimationFrame`：后台窗口与隐藏标签页不发帧，
   * 刷新会被无限期推迟。也不用微任务——`modify` 与 `css-change` 分属不同宏任务，合不到一起。
   *
   * 如实记账：这**去不掉**「`moveCardTo` 结尾的显式刷新」与「vault `modify` 事件」这一对。
   * `markSelfWriting` 的 350ms 抑制窗口若真失效，两者不在同一 tick，合并救不了。它实际能
   * 去重的是 `css-change` 与 `modify` 撞车、多个首页叶子、以及设置页连续保存。
   */
  private scheduleRefresh(fullPage: boolean): void {
    if (fullPage) {
      this.refreshFullPage = true;
    }
    if (this.refreshTimer !== null) {
      return;
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      const full = this.refreshFullPage;
      this.refreshFullPage = false;
      for (const leaf of this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)) {
        if (leaf.view instanceof HomeView) {
          void (full ? leaf.view.render() : leaf.view.refreshCards());
        }
      }
    }, 0);
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
    this.refreshHomeCards();
  }

  /** 删除是破坏性操作，入口却只是悬停卡片时才出现的图标按钮：先弹一次确认，写盘发生在用户
   *  点过「删除」之后。确认通过后走的仍是 `performRemoveCard` 里那道身份守卫。 */
  removeCard(section: CardSection): void {
    new ConfirmModal(
      this.app,
      `确定要删除卡片「${section.title}」吗？这会从仪表盘笔记里移除该小节及其内容。`,
      "删除",
      () => {
        void this.performRemoveCard(section);
      },
    ).open();
  }

  /** 用户点确认时，手里的 section 只是一份快照，文件可能在这中间被改过——卡片甚至可能已被
   *  删除或改了标题。所以按 `start` 在**正要写下去的那份文本**里重新找一次，并用
   *  `isSameSection` 确认还是同一张卡：对不上就只提示、不写盘（写下去会删错卡片）。
   *
   *  写盘走 `writeDashboard` 而不是裸 `store.process`：`process()` 在文件缺失时会抛，
   *  而调用方是 `void` 调用，裸抛只会留下未处理的 rejection（同 `moveCard` 的既有约定）。*/
  private async performRemoveCard(section: CardSection): Promise<void> {
    const level = this.settings.cardHeadingLevel;
    let aborted: string | null = null;
    const written = await this.writeDashboard((text) => {
      const current = parseDashboard(text, level).find(
        (candidate) => candidate.start === section.start,
      );
      if (!current || !isSameSection(section, current)) {
        aborted = "这张卡片已经不存在了，可能文件已被改动";
        return text;
      }
      return removeCardInText(text, current);
    });
    // aborted 只在回调里赋值，TS 的控制流分析看不到那条路径，收窄后会把这里读成恒为
    // null。先拷进带类型注解的局部变量再判空，中止提示才不是一段死代码。
    const message: string | null = aborted;
    if (message !== null) {
      new Notice(message);
      return;
    }
    if (!written) {
      return;
    }
    this.refreshHomeCards();
  }

  /**
   * 把第 `from` 张卡片移到 `target` 指定的「某列的第几张」。
   *
   * 要做两件事：把它的 `col` 写成目标列，并在笔记里挪到该列对应的位置。两件事各自判断
   * 需不需要做——**不能**因为「笔记顺序没变」就整个跳过：把某列唯一的卡片拖到另一个空列
   * 时顺序确实不变，但列必须改，早退会让这种拖拽静默失效。
   *
   * 同时**固化**所有还没写 `col` 的卡片。不固化的话，未指定 col 的卡片靠「笔记序号 % 列数」
   * 回退，而这次移动会让后续卡片的序号集体位移、连带跳列——正是列布局要消灭的现象。
   * 固化是一次性的、且写入的就是它们此刻的实际列号，所以视觉布局不变。
   */
  async moveCardTo(from: number, target: DropTarget, columns: number): Promise<void> {
    const level = this.settings.cardHeadingLevel;
    let lossy = false;
    // 走 writeDashboard 而不是裸 process：io.ts 的 process() 在文件缺失时会抛，
    // 而 home-view 是 `void this.plugin.moveCardTo(...)` 调用，裸抛只会留下未处理的 rejection。
    const written = await this.writeDashboard((text) => {
      // sections 必须在回调里现算：回调跑在 vault.process 内部、对**重新读出来的文本**执行，
      // 拿外面那份快照的偏移去切新文本会切错位置，把 section 挪坏而不只是挪错位置。
      const result = applyColumnDrop({
        text,
        sections: parseDashboard(text, level),
        from,
        target,
        columns,
        headingLevel: level,
      });
      lossy = result.lossy;
      return result.text;
    });
    if (lossy) {
      new Notice(
        "有卡片的 %%card: 行含插件无法表示的内容，它们的列号没有写入。请先手工调整那些行。",
      );
    }
    if (!written) {
      return;
    }
    this.refreshHomeCards();
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
      maxColumns: this.settings.gridColumns,
      onApply: (meta) => {
        void this.applyCardMeta(section, meta);
      },
    }).open();
  }

  /** 弹窗是拿「打开那一刻的 section」算出来的 meta，用户可能在这中间改了文件——卡片甚至
   *  可能已被删除或改标题。所以按 `start` 在**正要写下去的那份文本**里重新找一次，并用
   *  `isSameSection` 确认还是同一张卡：对不上就只提示、不写盘（写下去会改错卡片，甚至覆盖
   *  别人手写的 `%%card: %%`）。确认通过后用新解析出来的 section 偏移去改，而不是弹窗手里的
   *  旧值——回调跑在 `vault.process` 内部，拿到的就是即将落盘的那份文本。
   *
   *  写盘走 `writeDashboard` 而不是裸 `store.process`：`process()` 在文件缺失时会抛，
   *  而 `onApply` 是 `void` 调用，裸抛只会留下未处理的 rejection（同 `moveCard` 的既有约定）。*/
  async applyCardMeta(section: CardSection, meta: CardMeta): Promise<void> {
    const level = this.settings.cardHeadingLevel;
    let aborted: string | null = null;
    const written = await this.writeDashboard((text) => {
      const current = parseDashboard(text, level).find(
        (candidate) => candidate.start === section.start,
      );
      if (!current || !isSameSection(section, current)) {
        aborted = "这张卡片已经不存在了，可能文件已被改动";
        return text;
      }
      // 写盘是整行替换，所以解析阶段丢掉的东西会变成真的丢字。先确认这一行能被
      // 无损表示，否则宁愿不写——用户什么都没改就丢手写内容是最不该发生的事。
      if (
        current.metaRange &&
        hasLossyTokens(text.slice(current.metaRange.start, current.metaRange.end))
      ) {
        aborted =
          "这张卡片的 %%card: 行含有插件无法表示的内容（值里带分号、缺少 = 的片段、或重复的键），" +
          "为避免覆盖你手写的内容已放弃保存。请先手工调整该行。";
        return text;
      }
      return updateCardMetaInText(text, current, meta);
    });
    // 同 performRemoveCard：aborted 只在回调里赋值，不拷贝一次就会被 TS 收窄成恒为 null。
    const message: string | null = aborted;
    if (message !== null) {
      new Notice(message);
      return;
    }
    if (!written) {
      return;
    }
    this.refreshHomeCards();
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
  private async ensureDashboardFile(content = ""): Promise<boolean> {
    if (this.store.exists()) {
      return true;
    }
    try {
      await this.store.create(content);
      return true;
    } catch (error) {
      new Notice(`CardHomeTab: 无法创建仪表盘文件 ${this.store.path}：${errorMessage(error)}`);
      return false;
    }
  }

  /**
   * 新标签页 → 换成首页。
   *
   * 这里会在文件缺失时**直接按默认内容创建**，让用户一打开就有东西看。手动打开首页视图
   * 那条路径仍然停在"文件缺失"的提示页上、由用户点按钮——那条路径常常是设置里把路径填错了，
   * 静默写库反而更糟。
   *
   * 变成 async 是因为创建文件要等 vault 落盘。重入保护照旧：`layout-change` 会连续派发，
   * 同一个 leaf 上的第二次进来必须由 `replacingLeaf` 挡掉。
   */
  private async maybeReplaceEmptyLeaf(): Promise<void> {
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
    try {
      const content = defaultDashboard({
        headingLevel: this.settings.cardHeadingLevel,
        dashboardPath: this.store.path,
      });
      await this.ensureDashboardFile(content);
      // setViewState 会拒绝（例如视图注册失败），所以要接住
      await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
    } catch {
      // 换页失败就保持原样，不必打扰用户；创建失败已经由 ensureDashboardFile 给过 Notice
    } finally {
      if (this.replacingLeaf === leaf) {
        this.replacingLeaf = null;
      }
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
