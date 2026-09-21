import {
  AbstractInputSuggest,
  Notice,
  PluginSettingTab,
  prepareFuzzySearch,
  Setting,
  type App,
  type SettingDefinitionItem,
  type TFile,
} from "obsidian";
import { errorMessage } from "./errors";
import type CardHomeTabPlugin from "./main";

/**
 * 给“仪表盘文件”输入框加笔记补全。
 *
 * 这个字段用文本输入而不是下拉，因为它要能填一个还不存在的路径（用户先填、再让首页去创建）。
 * 但纯文本框会引出一类很难查的死局：`getAbstractFileByPath` 是**大小写敏感**的精确匹配，
 * 用户在 Windows/macOS 上把 `Home.md` 打成 `home.md`，文件明明在库里，`exists()` 却永远为 false，
 * 首页一直显示“文件缺失”，点“创建并打开”也修不好。补全让用户从真实文件名里选，从源头消掉这种输入。
 * `normalizeVaultPath` 仍然保留，作为手改 data.json 等情况下的兜底。
 *
 * `onPick` 是必需的：`setValue` 只是直接赋值给 input，不会触发 `input` 事件，
 * 所以 Setting 的 `onChange` 收不到，选择结果不会被保存。
 */
class FilePathSuggest extends AbstractInputSuggest<TFile> {
  private readonly onPick: (path: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onPick: (path: string) => void) {
    super(app, inputEl);
    this.onPick = onPick;
    this.limit = 50;
  }

  protected getSuggestions(query: string): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return files.slice(0, this.limit);
    }
    const match = prepareFuzzySearch(trimmed);
    const scored: { file: TFile; score: number }[] = [];
    for (const file of files) {
      const result = match(file.path);
      if (result) {
        scored.push({ file, score: result.score });
      }
    }
    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, this.limit).map((entry) => entry.file);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createDiv({ cls: "home-tab-suggestion-title", text: file.basename });
    el.createDiv({ cls: "home-tab-suggestion-path", text: file.path });
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onPick(file.path);
    this.close();
  }
}

export class CardHomeTabSettingTab extends PluginSettingTab {
  private readonly plugin: CardHomeTabPlugin;

  constructor(app: App, plugin: CardHomeTabPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * 本插件走命令式 `display()` 而不是声明式设置定义：`minAppVersion` 是 1.9.0，声明式 API 要
   * 1.13.0，只支持老版本的用户没有第二条路。这里返回**空数组**而不是把每个控件再声明一遍——
   * Obsidian 只在数组非空时才跳过 `display()`，空数组让新旧版本共用同一条渲染路径，行为一致；
   * 代价是 1.13+ 的设置搜索里搜不到这些项（要修就得把整页声明式地重写一遍）。
   *
   * 这个方法存在的直接原因是 `obsidianmd/settings-tab/prefer-setting-definitions` 会告警
   * 「没有 getSettingDefinitions」，而 `npm run lint` 是 `--max-warnings 0`，且该规则属于
   * `eslint-comments/no-restricted-disable` 保护的 `obsidianmd/*`，不能用禁用注释绕开。
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [];
  }

  display(): void {
    this.renderTab();
  }

  /** 改名自 brief 里的 `display()` 本体：`SettingTab.display()` 已标 `@deprecated`，而
   *  `@typescript-eslint/no-deprecated` 同样被 `no-restricted-disable` 保护、不能禁用，
   *  所以 tab 内部的「重建」不能再走 `this.display()`，改调这个私有方法（行为完全等价）。 */
  private renderTab(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;
    const save = (): void => {
      void this.plugin
        .saveSettings()
        .then(() => this.plugin.refreshHome())
        .catch((error: unknown) => {
          new Notice(`保存设置失败：${errorMessage(error)}`);
        });
    };

    new Setting(containerEl).setName("页面").setHeading();

    new Setting(containerEl)
      .setName("仪表盘文件")
      .setDesc("卡片内容所在的笔记路径。用标题切分卡片。")
      .addText((text) => {
        new FilePathSuggest(this.app, text.inputEl, (path) => {
          text.setValue(path);
          settings.dashboardFile = path;
          save();
        });
        text.setValue(settings.dashboardFile).onChange((value) => {
          settings.dashboardFile = value;
          save();
        });
      });

    new Setting(containerEl)
      .setName("卡片标题级别")
      .setDesc("用几级标题切分卡片。更深级别的标题留在卡片内部渲染。")
      .addDropdown((dropdown) => {
        for (const level of [2, 3, 4, 5, 6]) {
          dropdown.addOption(String(level), `${"#".repeat(level)} 标题`);
        }
        dropdown.setValue(String(settings.cardHeadingLevel));
        dropdown.onChange((value) => {
          settings.cardHeadingLevel = Number.parseInt(value, 10);
          save();
        });
      });

    new Setting(containerEl).setName("网格列数").addSlider((slider) =>
      slider
        .setLimits(1, 6, 1)
        .setValue(settings.gridColumns)
        .onChange((value) => {
          settings.gridColumns = value;
          save();
        }),
    );

    new Setting(containerEl)
      .setName("替换新标签页")
      .setDesc("打开新标签页时自动显示首页。")
      .addToggle((toggle) =>
        toggle.setValue(settings.replaceNewTabs).onChange((value) => {
          settings.replaceNewTabs = value;
          save();
        }),
      );

    new Setting(containerEl)
      .setName("启动时打开首页")
      .addToggle((toggle) =>
        toggle.setValue(settings.openOnStartup).onChange((value) => {
          settings.openOnStartup = value;
          save();
        }),
      );

    new Setting(containerEl).setName("品牌区").setHeading();

    new Setting(containerEl).setName("Logo 类型").addDropdown((dropdown) =>
      dropdown
        .addOptions({ none: "无", lucide: "内置图标", vaultImage: "仓库图片", url: "网络图片" })
        .setValue(settings.logoType)
        .onChange((value) => {
          settings.logoType = value as typeof settings.logoType;
          save();
          this.renderTab();
        }),
    );

    new Setting(containerEl)
      .setName(settings.logoType === "lucide" ? "图标名" : "图片路径或链接")
      .setDesc(
        settings.logoType === "lucide"
          ? "Lucide 图标 id，例如 lucide-flame。"
          : "仓库内的图片路径，或一个 HTTP(s) 链接。",
      )
      .addText((text) =>
        text.setValue(settings.logoValue).onChange((value) => {
          settings.logoValue = value;
          save();
        }),
      );

    new Setting(containerEl).setName("Logo 缩放").addSlider((slider) =>
      slider
        .setLimits(0.2, 5, 0.1)
        .setValue(settings.logoScale)
        .onChange((value) => {
          settings.logoScale = value;
          save();
        }),
    );

    new Setting(containerEl)
      .setName("Logo 颜色")
      .setDesc("留空则跟随主题强调色。仅对内置图标生效。")
      .addText((text) =>
        text.setValue(settings.logoColor).onChange((value) => {
          settings.logoColor = value;
          save();
        }),
      );

    new Setting(containerEl).setName("文字标识文案").addText((text) =>
      text.setValue(settings.wordmark).onChange((value) => {
        settings.wordmark = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示文字标识").addToggle((toggle) =>
      toggle.setValue(settings.showWordmark).onChange((value) => {
        settings.showWordmark = value;
        save();
      }),
    );

    new Setting(containerEl).setName("文字标识字号").addText((text) =>
      text.setValue(settings.fontSize).onChange((value) => {
        settings.fontSize = value;
        save();
      }),
    );

    new Setting(containerEl).setName("文字标识字重").addSlider((slider) =>
      slider
        .setLimits(100, 900, 100)
        .setValue(settings.fontWeight)
        .onChange((value) => {
          settings.fontWeight = value;
          save();
        }),
    );

    new Setting(containerEl).setName("背景").setHeading();

    new Setting(containerEl).setName("背景类型").addDropdown((dropdown) =>
      dropdown
        .addOptions({ none: "无", vaultImage: "仓库图片", url: "网络图片" })
        .setValue(settings.backgroundType)
        .onChange((value) => {
          settings.backgroundType = value as typeof settings.backgroundType;
          save();
        }),
    );

    new Setting(containerEl)
      .setName("亮色背景")
      .setDesc("仓库内图片路径或 HTTP(s) 链接。")
      .addText((text) =>
        text.setValue(settings.backgroundLight).onChange((value) => {
          settings.backgroundLight = value;
          save();
        }),
      );

    new Setting(containerEl)
      .setName("暗色背景")
      .setDesc("留空则暗色模式也使用亮色背景。")
      .addText((text) =>
        text.setValue(settings.backgroundDark).onChange((value) => {
          settings.backgroundDark = value;
          save();
        }),
      );

    new Setting(containerEl).setName("背景模糊").addSlider((slider) =>
      slider
        .setLimits(0, 40, 1)
        .setValue(settings.backgroundBlur)
        .onChange((value) => {
          settings.backgroundBlur = value;
          save();
        }),
    );

    new Setting(containerEl).setName("背景压暗").addSlider((slider) =>
      slider
        .setLimits(0, 100, 5)
        .setValue(settings.backgroundDim)
        .onChange((value) => {
          settings.backgroundDim = value;
          save();
        }),
    );

    new Setting(containerEl).setName("搜索").setHeading();

    new Setting(containerEl).setName("显示搜索框").addToggle((toggle) =>
      toggle.setValue(settings.showSearch).onChange((value) => {
        settings.showSearch = value;
        save();
      }),
    );

    new Setting(containerEl).setName("仅搜索 Markdown").addToggle((toggle) =>
      toggle.setValue(settings.markdownOnly).onChange((value) => {
        settings.markdownOnly = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示路径").addToggle((toggle) =>
      toggle.setValue(settings.showPath).onChange((value) => {
        settings.showPath = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示书签").addToggle((toggle) =>
      toggle.setValue(settings.showBookmarks).onChange((value) => {
        settings.showBookmarks = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示最近文件").addToggle((toggle) =>
      toggle.setValue(settings.showRecentFiles).onChange((value) => {
        settings.showRecentFiles = value;
        save();
      }),
    );

    new Setting(containerEl)
      .setName("结果数")
      .setDesc("搜索建议最多显示多少条。")
      .addSlider((slider) =>
        slider
          .setLimits(1, 50, 1)
          .setValue(settings.maxResults)
          .onChange((value) => {
            settings.maxResults = value;
            save();
          }),
      );

    new Setting(containerEl).setName("最近文件条数").addSlider((slider) =>
      slider
        .setLimits(0, 20, 1)
        .setValue(settings.maxRecentFiles)
        .onChange((value) => {
          settings.maxRecentFiles = value;
          save();
        }),
    );

    new Setting(containerEl).setName("片段").setHeading();

    void this.plugin.snippets.ensureUserNames().then(() => {
      const list = containerEl.createDiv({ cls: "home-tab-snippet-settings" });
      for (const info of this.plugin.snippets.list()) {
        const row = list.createDiv({ cls: "home-tab-snippet-settings-row" });
        row.createSpan({ text: info.source === "builtin" ? `内置：${info.name}` : `用户：${info.name}` });
        row.createSpan({ cls: "home-tab-snippet-path", text: info.path ?? "随插件发布" });
      }
      if (list.childElementCount === 0) {
        list.createDiv({ text: "还没有任何片段。" });
      }
    });

    new Setting(containerEl)
      .setName("片段目录")
      .setDesc(
        `${this.plugin.snippets.directory}（把自定义片段放这里，然后在卡片设置里引用 user:文件名）`,
      )
      .addButton((button) =>
        button.setButtonText("刷新列表").onClick(() => {
          this.plugin.snippets.invalidate();
          this.renderTab();
        }),
      );
  }
}
