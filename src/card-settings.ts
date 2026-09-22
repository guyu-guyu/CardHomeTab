import { Modal, getIconIds, setIcon, type App } from "obsidian";
import type { CardMeta } from "./dashboard/metadata";
import type { CardSection } from "./dashboard/parse";
import { parseSnippetRef, type SnippetRegistry } from "./snippets";

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
 * 片段只剩「用户片段」一种来源，所以这里就是一组复选框，没有别的来源或「自动」模式。
 */
export class CardSettingsModal extends Modal {
  private readonly args: CardSettingsArgs;
  private draft: CardMeta;
  private selectedSnippets: string[];
  private iconValue: string;
  private spanValue: number;
  private iconPreview: HTMLElement | null = null;

  constructor(args: CardSettingsArgs) {
    super(args.app);
    this.args = args;
    this.draft = {
      css: [...args.section.meta.css],
      span: args.section.meta.span,
      icon: args.section.meta.icon,
      entries: args.section.meta.entries.map((entry) => ({ ...entry })),
    };
    // 列表里没有的引用（手写的、或片段文件已被删除的）会一直留在 selectedSnippets 里，
    // 应用时原样回写，不会被这里吞掉。
    // 必须归一化成 `user:` 形式：手写的裸名 `mine` 与列表里的 `user:mine` 是同一个片段，
    // 不归一化的话复选框会显示未勾选、与文件里的实际配置对不上。
    // 解析不出来的引用（空串、`builtin:x`、别的前缀）在此丢弃——它们已经不指向任何东西。
    this.selectedSnippets = this.draft.css
      .map((ref) => parseSnippetRef(ref))
      .filter((name): name is string => name !== null)
      .map((name) => `user:${name}`);
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

    row.createDiv({ cls: "home-tab-snippet-list" });
    this.renderSnippetList();
  }

  private renderSnippetList(): void {
    const list = this.contentEl.querySelector(".home-tab-snippet-list");
    if (!(list instanceof HTMLElement)) {
      return;
    }
    list.empty();
    const available = this.args.snippets.list();
    if (available.length === 0) {
      // 内置片段移除后这个列表可能整段为空，不给一句话交代的话弹窗里是一片空白，像是坏了
      list.createDiv({
        cls: "home-tab-snippet-empty",
        text: `还没有自定义片段。把 .css 文件放进 ${this.args.snippets.directory} 即可。`,
      });
      return;
    }
    for (const info of available) {
      const label = list.createEl("label", { cls: "home-tab-checkbox" });
      const box = label.createEl("input", { attr: { type: "checkbox" } });
      box.checked = this.selectedSnippets.includes(info.ref);
      label.createSpan({ text: info.name });
      label.createSpan({ cls: "home-tab-snippet-path", text: info.path });
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
      this.draft.css = [...this.selectedSnippets];
      this.draft.span = this.spanValue;
      this.draft.icon = this.iconValue;
      this.args.onApply(this.draft);
      this.close();
    });
  }
}
