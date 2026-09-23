import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { renderBackground } from "./background";
import { CardView } from "./card";
import { enableGridDrop } from "./card-grid";
import { contentStyleGates, contentStyleVariables } from "./content-styles";
import { enableColumnLayout, placeCards, primeColumnLayout, type LayoutCard } from "./column-layout";
import { parseDashboard, sectionBody } from "./dashboard/parse";
import { errorMessage } from "./errors";
import type CardHomeTabPlugin from "./main";
import { renderHeader } from "./page-header";
import { buildCandidates, readBookmarkPaths, renderSearchBar } from "./search-bar";
import { scopedStylesheet } from "./snippet-scope";
import { resolveSnippetRefs } from "./snippets";

export const HOME_VIEW_TYPE = "card-home-tab-view";

export class HomeView extends ItemView {
  private readonly plugin: CardHomeTabPlugin;
  private rootEl: HTMLElement | null = null;
  /**
   * 当前的卡片网格。`refreshCards()` 靠它判断能不能走"只重建卡片"那条快路径。
   *
   * 必须在 `render()` 的**同步序言**里置 null：`render()` 在 `root.empty()` 之后还有
   * `await readBookmarkPaths` 才建出新网格，此间若 `refreshCards()` 到来而这里仍指向已被
   * empty 掉的旧网格，就会往脱离文档的元素里渲染，随后 `render()` 因 token 失配返回——
   * 结果是整页空白。置 null 后 `refreshCards()` 会自动退回整页，语义正确。
   */
  private gridEl: HTMLElement | null = null;
  private cardViews: CardView[] = [];
  private disposeSearch: (() => void) | null = null;
  private disposeLayout: (() => void) | null = null;
  private disposeIndicator: (() => void) | null = null;
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
    this.disposeLayout?.();
    this.disposeLayout = null;
    this.disposeIndicator?.();
    this.disposeIndicator = null;
    this.gridEl = null;
    this.rootEl = null;
    this.contentEl.empty();
  }

  /**
   * 整页渲染：打开视图、设置变更、popout 往返、从缺失态恢复。
   *
   * 笔记或片段变更请走 `refreshCards()`——那条路径不会重建背景、logo 与搜索框，
   * 避免每次拖动卡片都把整页清空再搭一遍。
   */
  async render(): Promise<void> {
    const token = ++this.renderToken;
    const root = this.rootEl;
    if (!root) {
      return;
    }
    this.disposeCards();
    this.disposeSearch?.();
    this.disposeSearch = null;
    // 旧网格马上会被 root.empty() 丢掉，但 ResizeObserver 仍持着它与它的卡片，
    // 不断开就会在已脱离文档的节点上继续回调。
    this.disposeLayout?.();
    this.disposeLayout = null;
    this.disposeIndicator?.();
    this.disposeIndicator = null;
    // 必须在任何 await 之前置 null，理由见字段声明处
    this.gridEl = null;
    root.empty();
    // 内容样式与卡片外观。必须用幂等的 toggleClass 而不是 addClass：rootEl 在 onOpen()
    // 建一次、render() 只清空它的内容，它本身跨次渲染存活，addClass 会让关掉开关后仍残留。
    // 遍历注册表而不是逐个手写，注册表里加一条特性这里就自动生效。
    // 放在早退分支之前，保证"文件缺失"时类的状态也是对的。
    //
    // 枚举型特性的**每个**候选类都会拿到一条（选中的为 true、其余为 false），所以切换枚举时
    // 旧值的类必然被摘掉，不需要自己记住上一个值。
    for (const gate of contentStyleGates(this.plugin.settings)) {
      root.toggleClass(gate.className, gate.on);
    }
    // 数值与部分枚举走 CSS 变量。每次都把全部变量重写一遍，所以幂等、也不存在「改回默认值后
    // 残留旧变量」——变量型特性没有"关"态，0 与 none 也是具体值。
    //
    // 只在这条整页路径上写。卡片间距会参与列布局的行距换算，而 placeCards 读的是
    // getComputedStyle(gridEl).columnGap——变量必须在下面建 gridEl **之前**就位。
    // 换句话说：任何未来「改了卡片外观但不走整页 render」的路径都会静默失效。
    for (const variable of contentStyleVariables(this.plugin.settings)) {
      root.style.setProperty(variable.name, variable.value);
    }
    if (!this.plugin.store.exists()) {
      this.renderMissingFile(root);
      return;
    }
    const stage = root.createDiv({ cls: "home-tab-stage" });
    renderBackground(stage, this.app, this.plugin.settings);
    renderHeader(stage, this.app, this.plugin.settings);
    if (this.plugin.settings.showSearch) {
      // readBookmarkPaths 是一个挂起点，照既有约定补一次 token 校验：重渲染若已经 root.empty()
      // 过，这块 stage 已脱离文档，继续往上挂搜索框只会留下一个绑在死节点上的 suggest 实例。
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
    this.gridEl = stage.createDiv({ cls: "home-tab-cards" });
    // 必须是本方法的最后一条语句：它内部还会 await，之后再写 DOM 就可能发生在更新的一轮之后。
    await this.renderCards(token);
  }

  /**
   * 只重建卡片网格，背景 / logo / 搜索框原地不动。笔记与片段变更走这里。
   *
   * 三种情况必须退回整页：还没整页渲染过（没有网格）、网格已脱离文档、以及文件缺失
   * （缺失态是画在 root 上的，那时既没有 stage 也没有网格）。
   */
  async refreshCards(): Promise<void> {
    if (!this.gridEl || !this.gridEl.isConnected || !this.plugin.store.exists()) {
      await this.render();
      return;
    }
    await this.renderCards(++this.renderToken);
  }

  private async renderCards(token: number): Promise<void> {
    const grid = this.gridEl;
    if (!grid) {
      return;
    }
    // 先把文件读完再动 DOM：反过来（先清空再读盘）会让卡片在读盘期间整片消失，
    // 那正是我们要消灭的闪烁，只是换了个位置复现。
    const text = await this.plugin.store.read();
    if (token !== this.renderToken) {
      return;
    }
    if (text === null) {
      // 文件在视图打开期间被删了：缺失态要画在 root 上，只能退回整页
      await this.render();
      return;
    }
    const sections = parseDashboard(text, this.plugin.settings.cardHeadingLevel);

    // 顺序不能调换：网格元素是跨刷新复用的，而 enableGridDrop 的 dispose 是对**同一个元素**
    // 做 removeEventListener——先 enable 再 dispose 会把刚装上的监听器摘掉，拖拽彻底失效
    // 且完全静默。enableColumnLayout 的 dispose 同理会摘掉刚加的 is-column-layout。
    this.disposeCards();
    this.disposeLayout?.();
    this.disposeLayout = null;
    this.disposeIndicator?.();
    this.disposeIndicator = null;
    grid.empty();

    // 在建卡片之前就把网格置成最终几何。否则循环期间网格没有列模板、是隐式单列，每张卡片
    // 占满宽度，循环结束才一次性吸附成 N 列——这就是"拖动后闪烁、宽卡片短暂占满整宽"的来源。
    const columns = primeColumnLayout(grid, this.plugin.settings.gridColumns);

    // 在循环里顺手攒布局数组，而不是事后按下标去对 sections：两个数组按下标耦合
    // 一旦哪天循环里加了 continue 就会静默错位。
    const layoutCards: LayoutCard[] = [];

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
        callbacks: {
          onEdit: (target) => void this.plugin.editCard(target),
          onRemove: (target) => this.plugin.removeCard(target),
          onSettings: (target) => this.plugin.openCardSettings(target),
        },
      });
      this.cardViews.push(card);
      layoutCards.push({ el: card.el, col: section.meta.col, span: section.meta.span });
      grid.appendChild(card.el);

      const parts = await this.plugin.snippets.resolveAll(resolveSnippetRefs(section.meta.css));
      if (token !== this.renderToken) {
        return;
      }
      await card.render(body, scopedStylesheet(parts, cardId));
      // 每渲染完一张就归位，让卡片一张张出现且直接落在最终位置。放在 render 之后而不是
      // appendChild 之后：刚 append 的卡片还是空的，量它没有意义。
      placeCards(grid, layoutCards, columns);
    }
    // 异步内容（图片、base、dataview）之后再撑高时，由 ResizeObserver 负责重算。
    this.disposeLayout = enableColumnLayout(grid, layoutCards, this.plugin.settings.gridColumns);

    // 投放要等 layoutCards 填好：落点判定要按笔记顺序拿到全部卡片的列号与矩形。
    this.disposeIndicator = enableGridDrop({
      gridEl: grid,
      cards: layoutCards,
      configuredColumns: this.plugin.settings.gridColumns,
      onDrop: (from, target, dropColumns) => {
        void this.plugin.moveCardTo(from, target, dropColumns);
      },
    });
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
