import { Modal, getIconIds, setIcon, type App } from "obsidian";
import { AUTO_CSS, isAutoCss, type CardMeta } from "./dashboard/metadata";
import type { CardSection } from "./dashboard/parse";
import type { SnippetRegistry } from "./snippets";

export interface CardSettingsArgs {
  app: App;
  section: CardSection;
  snippets: SnippetRegistry;
  onApply: (meta: CardMeta) => void;
}

/**
 * 用 `Modal` 而不是锚定 popover：锚定浮层要自己处理定位、外部点击关闭、层级与滚动跟随，
 * 而 `Modal` 自带焦点陷阱与 Esc 关闭——设置项不多，没必要自己实现这一套。
 *
 * 「自动」是一个独立复选框，不是手动选择的替代品：Task 5 之后 `css=auto` 在列表里
 * **任何位置**都会展开，`%%card: css=auto,user:mine%%` 的语义是「自动 + 我的片段」。
 * 所以勾选它只是往 `css` 列表里加一项，不能清空用户已勾的片段（那会静默丢数据）。
 */
export class CardSettingsModal extends Modal {
  private readonly args: CardSettingsArgs;
  private draft: CardMeta;
  private selectedSnippets: string[];
  private iconValue: string;
  private spanValue: number;
  private iconPreview: HTMLElement | null = null;
  private autoBox: HTMLInputElement | null = null;

  constructor(args: CardSettingsArgs) {
    super(args.app);
    this.args = args;
    this.draft = {
      css: [...args.section.meta.css],
      span: args.section.meta.span,
      icon: args.section.meta.icon,
      entries: args.section.meta.entries.map((entry) => ({ ...entry })),
    };
    // 只挑出非 auto 的引用作为复选框状态；列表里没有的引用（例如手写的、或片段文件
    // 已被删除的）会一直留在 selectedSnippets 里，应用时原样回写，不会被这里吞掉。
    // 手写 `%%card: css=base%%` 里的裸片段名合法（resolveSnippetRefs 会当成 builtin:），
    // 但列表里的 ref 写作 `builtin:base`，不归一化的话复选框会是未勾选、与文件对不上。
    this.selectedSnippets = this.draft.css
      .filter((ref) => ref !== AUTO_CSS)
      .map((ref) => (ref.includes(":") ? ref : `builtin:${ref}`));
    this.iconValue = this.draft.icon;
    this.spanValue = this.draft.span;
  }

  async onOpen(): Promise<void> {
    await this.args.snippets.ensureUserNames();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `卡片设置：${this.args.section.title}` });

    this.renderIcon(contentEl);
    this.renderSnippets(contentEl);
    this.renderSpan(contentEl);
    this.renderFooter(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderIcon(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "home-tab-setting-row" });
    row.createDiv({ cls: "home-tab-setting-label", text: "图标" });

    const controls = row.createDiv({ cls: "home-tab-setting-control" });
    this.iconPreview = controls.createSpan({ cls: "home-tab-icon-preview" });
    this.paintIconPreview();

    const datalist = controls.createEl("datalist", { attr: { id: "home-tab-icon-ids" } });
    for (const id of getIconIds().slice(0, 400)) {
      datalist.createEl("option", { attr: { value: id } });
    }
    // 占位文本是中文而不是 brief 里的 "lucide-chart"：obsidianmd/ui/sentence-case 只接受
    // 句首大写的 UI 文案，而图标 id 必须是小写，两者不可兼得；本项目 UI 文案一律中文，
    // 所以把示例 id 放进中文句子里。
    const input = controls.createEl("input", {
      attr: { type: "text", list: "home-tab-icon-ids", placeholder: "图标 ID，例如 lucide-chart" },
    });
    input.value = this.iconValue;
    input.addEventListener("input", () => {
      this.iconValue = input.value.trim();
      this.paintIconPreview();
    });
  }

  private paintIconPreview(): void {
    const preview = this.iconPreview;
    if (!preview) {
      return;
    }
    preview.empty();
    if (this.iconValue.length === 0) {
      preview.setText("无");
      return;
    }
    setIcon(preview, this.iconValue);
  }

  private renderSnippets(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "home-tab-setting-row is-column" });
    row.createDiv({ cls: "home-tab-setting-label", text: "CSS 片段" });

    const autoLabel = row.createEl("label", { cls: "home-tab-checkbox" });
    const autoBox = autoLabel.createEl("input", { attr: { type: "checkbox" } });
    this.autoBox = autoBox;
    autoBox.checked = isAutoCss(this.args.section.meta);
    autoLabel.createSpan({ text: "自动（按卡片里的内容类型套用内置片段）" });

    row.createDiv({ cls: "home-tab-snippet-list" });
    this.renderSnippetList();
  }

  private renderSnippetList(): void {
    const list = this.contentEl.querySelector(".home-tab-snippet-list");
    if (!(list instanceof HTMLElement)) {
      return;
    }
    list.empty();
    for (const info of this.args.snippets.list()) {
      const label = list.createEl("label", { cls: "home-tab-checkbox" });
      const box = label.createEl("input", { attr: { type: "checkbox" } });
      box.checked = this.selectedSnippets.includes(info.ref);
      const text = info.source === "builtin" ? `内置：${info.name}` : `用户：${info.name}`;
      label.createSpan({ text });
      if (info.path) {
        label.createSpan({ cls: "home-tab-snippet-path", text: info.path });
      }
      box.addEventListener("change", () => {
        if (box.checked) {
          if (!this.selectedSnippets.includes(info.ref)) {
            this.selectedSnippets.push(info.ref);
          }
        } else {
          this.selectedSnippets = this.selectedSnippets.filter((ref) => ref !== info.ref);
        }
      });
    }
  }

  private renderSpan(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "home-tab-setting-row" });
    row.createDiv({ cls: "home-tab-setting-label", text: "跨列数" });
    const input = row.createEl("input", {
      cls: "home-tab-span-input",
      attr: { type: "number", min: "1", max: "6" },
    });
    input.value = String(this.spanValue);
    input.addEventListener("input", () => {
      const parsed = Number.parseInt(input.value, 10);
      this.spanValue = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 6) : 1;
    });
  }

  private renderFooter(parent: HTMLElement): void {
    const footer = parent.createDiv({ cls: "home-tab-setting-footer" });
    const cancel = footer.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const apply = footer.createEl("button", { text: "应用", cls: "mod-cta" });
    apply.addEventListener("click", () => {
      const auto = this.autoBox?.checked ?? false;
      this.draft.css = auto ? [AUTO_CSS, ...this.selectedSnippets] : [...this.selectedSnippets];
      this.draft.span = this.spanValue;
      this.draft.icon = this.iconValue;
      this.args.onApply(this.draft);
      this.close();
    });
  }
}
