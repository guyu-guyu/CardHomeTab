import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { resolveSnippetRefs } from "./auto-snippets";
import { renderBackground } from "./background";
import { CardView } from "./card";
import { parseDashboard, sectionBody } from "./dashboard/parse";
import { errorMessage } from "./errors";
import type CardHomeTabPlugin from "./main";
import { renderHeader } from "./page-header";
import { buildCandidates, readBookmarkPaths, renderSearchBar } from "./search-bar";
import { scopedStylesheet } from "./snippet-scope";

export const HOME_VIEW_TYPE = "card-home-tab-view";

export class HomeView extends ItemView {
  private readonly plugin: CardHomeTabPlugin;
  private rootEl: HTMLElement | null = null;
  private cardViews: CardView[] = [];
  private disposeSearch: (() => void) | null = null;
  private renderToken = 0;

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
    this.renderToken++;
    this.disposeCards();
    this.disposeSearch?.();
    this.disposeSearch = null;
    this.rootEl = null;
    this.contentEl.empty();
  }

  async render(): Promise<void> {
    const token = ++this.renderToken;
    const root = this.rootEl;
    if (!root) {
      return;
    }
    this.disposeCards();
    this.disposeSearch?.();
    this.disposeSearch = null;
    root.empty();
    if (!this.plugin.store.exists()) {
      this.renderMissingFile(root);
      return;
    }
    const text = await this.plugin.store.read();
    if (token !== this.renderToken) {
      return;
    }
    if (text === null) {
      this.renderMissingFile(root);
      return;
    }
    const sections = parseDashboard(text, this.plugin.settings.cardHeadingLevel);
    const stage = root.createDiv({ cls: "home-tab-stage" });
    renderBackground(stage, this.app, this.plugin.settings);
    renderHeader(stage, this.app, this.plugin.settings);
    if (this.plugin.settings.showSearch) {
      // readBookmarkPaths 是 render() 里继 store.read() 之后新增的挂起点，照既有约定补一次
      // token 校验：重渲染若已经 root.empty() 过，这块 stage 已脱离文档，继续往上挂搜索框
      // 只会留下一个绑在死节点上的 suggest 实例。
      const bookmarkPaths = await readBookmarkPaths(this.app);
      if (token !== this.renderToken) {
        return;
      }
      const recentPaths = this.plugin.settings.recentFiles.map((entry) => entry.path);
      const candidates = buildCandidates(
        this.app,
        this.plugin.settings,
        bookmarkPaths,
        recentPaths,
      );
      const emptyState = candidates
        .filter((candidate) => candidate.kind !== "file")
        .slice(0, this.plugin.settings.maxResults);
      this.disposeSearch = renderSearchBar(
        stage,
        this.app,
        this.plugin.settings,
        candidates,
        emptyState,
        (candidate, newLeaf) => {
          void this.plugin.openSearchResult(candidate.path, newLeaf);
        },
      );
    }
    const grid = stage.createDiv({ cls: "home-tab-cards" });
    grid.style.gridTemplateColumns = `repeat(${this.plugin.settings.gridColumns}, minmax(0, 1fr))`;

    for (const section of sections) {
      if (token !== this.renderToken) {
        return;
      }
      const body = sectionBody(text, section);
      const cardId = `card-${section.index}`;
      const card = new CardView({
        app: this.app,
        section,
        dashboardPath: this.plugin.store.path,
        cardId,
        index: section.index,
        gridEl: grid,
        callbacks: {
          onEdit: (target) => void this.plugin.editCard(target),
          onRemove: (target) => void this.plugin.removeCard(target),
          onSettings: (target) => this.plugin.openCardSettings(target),
        },
        onDrop: (from, to) => {
          void this.plugin.moveCard(from, to);
        },
      });
      this.cardViews.push(card);
      grid.appendChild(card.el);

      const parts = await this.plugin.snippets.resolveAll(resolveSnippetRefs(section.meta, body));
      if (token !== this.renderToken) {
        return;
      }
      await card.render(body, scopedStylesheet(parts, cardId));
    }
  }

  private disposeCards(): void {
    for (const card of this.cardViews) {
      card.destroy();
    }
    this.cardViews = [];
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
