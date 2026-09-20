# CardHomeTab 设计说明

日期：2026-09-20

## 目标

仿照 Home Tab 插件做一个 Obsidian 启动页：自定义 logo、搜索框、自定义背景图，以及核心功能——自定义卡片。卡片支持 Obsidian 的全部内容（纯文本、代码块、内置查询块、base 块、dataview 块），并且每张卡片可以引用不同的 CSS 片段来自定义样式。

## 与 Home Tab 的差异

| 能力 | Home Tab (Renso) | CardHomeTab |
| --- | --- | --- |
| logo / wordmark | 有 | 有（对齐） |
| 搜索框 | 有（书签 + 最近文件） | 有（对齐） |
| 自定义背景图 | 无 | 有 |
| 卡片 | 无 | 核心功能 |
| 卡片内容存储 | — | 单一仪表盘 md 文件，按标题切分 |
| 每卡独立样式 | — | 引用 CSS 片段，内置片段按内容类型分组 |

## 插件身份

| 项 | 值 |
| --- | --- |
| id / name | `card-home-tab` / `CardHomeTab` |
| author | `guyu-guyu` |
| minAppVersion | `1.9.0` |
| isDesktopOnly | `false` |

`minAppVersion` 定在 1.9.0 有两个原因：`@scope` 需要 Chromium 118+，以及内置的 `builtin:base` 片段针对 Bases（1.9 引入）。全部功能都只用公开 API，因此移动端可用。

## 核心决策

### 决策 1：卡片内容存在一个真实的 md 文件里

| 方案 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- |
| 每张卡片一个笔记 | 隔离清晰 | 卡片一多文件爆炸，首页还要维护文件列表 | 不采用 |
| 内容存 `data.json` 字符串 | 完全自包含 | 脱离 Obsidian 原生编辑；嵌入与相对链接没有解析基准，必须额外配置一个"假装属于哪篇笔记"的路径 | 不采用 |
| 单一仪表盘笔记 + 标题切分 | 就是一篇普通笔记，原生编辑器直接改；解析基准天然是这篇笔记自己，嵌入/base/相对链接全部正常；可被双链引用、随 vault 同步、git 友好 | 卡片正文里不能再用同级标题 | 采用 |

第三种方案顺带消掉了一个绕人的设置项：`MarkdownRenderer.render` 要求传入 `sourcePath`，卡片内容只有落在一个真实文件上，这个值才不需要用户手动配置。

### 决策 2：卡片外观元数据写在 section 内的原生注释里

```markdown
## 统计
%%card: css=auto; span=2; icon=lucide-chart%%
正文，随便写
```

- 单一数据源，配置跟着 section 走：标题改名、拖拽移动都不会丢配置，因此**卡片不需要稳定 id**（运行时生成临时 id 即可满足 DOM 与 CSS 作用域的需要）。
- `%% %%` 是 Obsidian 原生注释语法。写在 section 内部而不是标题行里，避免污染标题——标题行里插标记会扭曲大纲面板、搜索结果和反链中显示的标题文字。
- 由首页的「卡片设置」弹窗自动生成，用户也可以手写。

### 决策 3：CSS 片段用 `@scope` 做作用域隔离

Obsidian 的 CSS 片段默认全局生效。要让一个片段只作用于某张卡片，插件必须自己读取片段内容并做作用域隔离。做法是把片段原文整体包进：

```css
@scope (.home-card.home-card[data-card-id="x"]) { /* 片段原文 */ }
```

- 只影响这张卡片，**不写 `enabledCssSnippets`**，完全不打扰全局片段状态。
- 作用域根类名重复一次，把优先级抬到 `0,2,0`，避免被主题选择器盖掉。
- 预处理：`:root` → `:scope`（`@scope` 内 `:root` 指向文档根，不会匹配）。`.theme-dark .foo` 这类带外部祖先的选择器不需要特殊处理，主题类挂在 `body` 上，天然仍然可匹配。
- 拒绝 `@import`，避免外链注入。
- 备选方案（不采用）：自己做 CSS 解析加选择器前缀（脆弱）、Shadow DOM（会切断 Obsidian 主题变量与 dataview 产物的样式）、要求用户手动启用全局片段（污染全局）。

### 决策 4：内容编辑走原生笔记，不做内嵌编辑器

点卡片的「编辑」→ 打开仪表盘笔记，光标与视口定位到该 section 的标题行。

理由：

1. 内容已经是真实文件，Obsidian 原生编辑器就是最好的编辑器——实时预览、补全、代码块高亮全部原生，零额外实现。
2. 完全使用公开 API。原先的候选方案「弹窗内嵌 `MarkdownView`」需要非公开的 `new WorkspaceLeaf(app)`（该构造函数没有出现在类型声明里），属于版本脆弱点。
3. 同一文件不允许同时开两个编辑器。弹窗里嵌一个、标签页里再开一个会导致状态错乱。

首页监听 `vault` 的文件变化实时重渲染，因此在标签页里编辑时，首页的卡片同步更新。

### 决策 5：内置片段按内容类型分组

内置片段不是按视觉风格分（毛玻璃/描边之类），而是按**渲染出来的内容类型**分：插件只为"卡片里嵌块"这个真正难的场景兜底，卡片本身的外观交给用户自己的片段。反查 `obsidian.asar` 与 dataview 官方 `styles.css` 得到的选择器如下（已核实）：

| 内置片段 | 目标选择器 | 作用 |
| --- | --- | --- |
| `builtin:base` | `.block-language-base`、`.bases-embed`、`.bases-view`、`.bases-query-container`、`.bases-header`、`.bases-table-container`、`.bases-thead`、`.bases-tr`、`.bases-td`、`.bases-list-item`、`.bases-cards-line`、`.bases-toolbar` | 卡片内嵌 base 的紧凑化：收敛外边距、表头吸顶、限高内滚、toolbar 缩小 |
| `builtin:query` | `.internal-query-header`、`.internal-query-header-icon`、`.internal-query-header-title`、`.search-result-container`、`.search-results`、`.search-result-file-title`、`.search-result-file-matches`、`.search-result-file-match` | 内置查询块的结果列表紧凑化、限高内滚、header 可隐藏 |
| `builtin:dataview` | `.block-language-dataview`、`.block-language-dataviewjs`、`.table-view-table`、`.dataview-result-list-ul`、`.dataview.task-list-item`、`.dataview.inline-field-key`、`.dataview.inline-field-value`、`.dataview-error-box` | 表格紧凑 + 表头吸顶、任务与列表收紧、错误框缩小 |
| `builtin:text` | 卡片内的 `.markdown-rendered` 排版 | 首末元素去外边距、标题缩放、列表缩进、表格边框收敛 |
| `builtin:code` | `pre`、`pre > code`、`code` | 代码块限高内滚、行内代码、强制等宽字体 |

两个必须记录的实测结论：

- **`query` 没有 `.block-language-query`。** Obsidian 的渲染器把 `mermaid` 和 `query` 用 `else if` 特判，不走 `codeBlockPostProcessors` 那条 `createDiv("block-language-" + lang)` 分支，因此查询块外面只有 `code.language-query`，样式必须打在 `.internal-query-header` / `.search-result-container` 这些内部类上。
- **`builtin:dataview` 需要装上 dataview 后实测校准。** 选择器来自 dataview 官方 `styles.css`，但代码块的实际包法没有在无 dataview 的环境里验证过。

上表列的是**相关选择器全集**，实际随插件发布的片段只用了其中的一个子集（够实现"作用"那一列描述的效果即可）。核对这些类名时要认准 `obsidian.asar`：`.obsidian/plugins` 下第三方插件自己的 CSS 会出现 Obsidian 本体并不发出的类名（例如 `.search-result-file-path`，本体里出现 0 次），照抄会写出永不生效的规则。

`css=auto` 表示按卡片正文里实际出现的内容类型自动套用对应的内置片段（有 base 块就套 `builtin:base`，有 query 就套 `builtin:query`，依此类推）。自动检测只识别围栏代码块的语言标记与 `.base` 嵌入，不做 DOM 探测。

## 文件与数据模型

### 设置结构

```ts
interface CardHomeTabSettings {
  version: number;                  // 迁移用
  dashboardFile: string;            // 默认 "Home.md"
  cardHeadingLevel: number;         // 默认 2
  replaceNewTabs: boolean;          // 默认 true
  openOnStartup: boolean;
  logoType: 'none' | 'lucide' | 'vaultImage' | 'url';
  logoValue: string;
  logoScale: number;
  logoColor: string;
  wordmark: string;
  showWordmark: boolean;
  fontSize: string;
  fontWeight: number;
  backgroundType: 'none' | 'vaultImage' | 'url';
  backgroundLight: string;
  backgroundDark: string;
  backgroundBlur: number;
  backgroundDim: number;
  showSearch: boolean;
  maxResults: number;
  markdownOnly: boolean;
  showPath: boolean;
  showBookmarks: boolean;
  showRecentFiles: boolean;
  maxRecentFiles: number;
  gridColumns: number;
  recentFiles: { path: string; timestamp: number }[];
}
```

卡片不再出现在设置里——卡片及其元数据全部由仪表盘文件承载。设置只保留页面级与外观级配置。

### 文件结构

```markdown
# 我的首页

## 统计
%%card: css=auto; span=2; icon=lucide-chart%%
正文……

## 待办
%%card: css=text,todo%%
- [ ] ……
```

- 标题级别等于 `cardHeadingLevel` 的标题切出一张卡片；更深级别的标题留在卡片内部正常渲染。
- 标题到下一个同级标题之间的内容就是卡片正文。
- H1 与 frontmatter 视作页面级，不生成卡片。
- 标题文字即卡片标题。

### `%%card:` 注释语法

- 格式：`%%card: key=value; key=value%%`
- 字段间用 `;` 分隔，多值用 `,` 分隔，键值用 `=`
- 已知键：`css`（片段引用列表，或 `auto`）、`span`（跨列数）、`icon`（Obsidian 图标 id，取自 `getIconIds()`，形如 `lucide-chart`）
- 必须位于标题之后第一个非空行
- 未识别的键**原样保留**，不清理用户手写内容
- 缺失注释 = 纯内容卡片（`span=1`、无片段、无图标）

### 解析规则

解析器是纯函数，不依赖 Obsidian，必须处理：

- 跳过围栏代码块内的标题行。围栏识别需支持 ``` 与 ~~~、不同长度的围栏、以及围栏语言后缀，否则卡片正文里的代码块会把卡片切碎。
- 只在行首（允许前置空格）识别标题，避开正文中的行内 `##`。
- 记录每个 section 的字符区间，供写入时精确定位。

### 写入规则

- 一律通过 `vault.process` 在同一原子回调中完成。
- 只替换目标 section 的字符区间，文件其余部分逐字节保留——不做"解析成对象再整体重新序列化"，避免破坏用户手写的格式、空行和缩进。
- 仪表盘文件不存在时**不静默创建**：弹窗告知期望的路径，用户确认后才创建。

### 顺序与增删

- 顺序 = 文件中的顺序。
- 拖拽排序 = 移动 section 文本。
- 新建卡片 = 追加一个 section。
- 删除卡片 = 移除该 section（二次确认）。

## 页面结构

```text
.home-tab-root
├── .home-tab-background      绝对定位图层：亮/暗两套图、blur、压暗遮罩
├── .home-tab-hero            logo（none/lucide/vaultImage/url）+ wordmark
├── .home-tab-search          AbstractInputSuggest 驱动的输入框
└── .home-tab-cards           CSS grid，卡片高度随内容自适应
```

- 网格：`grid-template-columns: repeat(gridColumns, minmax(0,1fr))`，卡片高度自适应；`span` 映射为 `grid-column: span k`；宽度小于 900px 时降为单列。
- 拖拽排序：HTML5 `draggable`，落点算出插入位置，然后移动文件里的 section 文本。
- 卡片内容容器：`.home-card-content.markdown-rendered`。`markdown-rendered` 必须手动加，否则主题排版、bases 与 dataview 的 CSS 变量都打不进来（Obsidian 自己的悬浮预览也是这么做的）。

## 卡片渲染管线

1. 卡片 DOM：`.home-card[data-card-id]` → 标题栏（图标 + 标题 + 操作条）→ `.home-card-content`。
2. 每张卡片一个 `Component`：`new Component()` → `addChild` → `load()`。
3. `MarkdownRenderer.render(app, sectionBody, contentEl, dashboardFilePath, component)`。走 Obsidian 完整管线，因此代码块、```` ```query ````、```` ```base ````、dataview 注册的 codeblock processor 全部原生生效；dataview 未安装时该代码块退化为普通代码块，不报错。
4. `sourcePath` 固定为仪表盘文件路径。
5. 重渲染 = `component.unload()` + 清空 + 重建 Component。`MarkdownRenderer.render` 是异步的，用递增 token 丢弃过期结果，避免旧 Promise 覆盖新内容。
6. 刷新策略：文件变化 → 重算 section 并重渲染受影响的卡片；视图重开 → 全量渲染；另提供「刷新所有卡片」命令。不主动轮询 dataview。

## 首页交互

卡片悬停出现操作条：

| 操作 | 行为 |
| --- | --- |
| 拖拽手柄 | 移动 section |
| 卡片设置 | 弹窗：图标、css 片段（内置 + 用户，多选）、跨列数 → 写回 `%%card:%%` 注释并重渲染该卡 |
| 编辑 | 打开仪表盘笔记并定位到该 section 的标题行 |
| 删除 | 移除该 section（二次确认） |

## 搜索框

- 匹配与高亮复用 Obsidian 自己的内核：`prepareFuzzySearch` 打分、`renderResults` 渲染高亮。输入建议用公开类 `AbstractInputSuggest`。
- 数据源：vault 文件（`markdownOnly` 时仅 Markdown）、书签、最近文件。
- 书签通过 `app.vault.adapter.read(configDir + '/bookmarks.json')` 读取，格式为 `{ items: [{ type, path, ctime }] }`；Obsidian 没有提供公开的书签 API。
- 空输入时展示书签与最近文件建议。
- 回车在当前标签打开，`Ctrl/Cmd+Enter` 在新标签打开。

## 设置页

| 分区 | 内容 |
| --- | --- |
| 页面 | 仪表盘文件（文件选择器）、卡片标题级别、替换新标签页、启动时打开、网格列数 |
| 品牌区 | logo 类型与取值、缩放、颜色、wordmark 文案、字号、字重 |
| 背景 | 类型、亮/暗两套取值、模糊、压暗 |
| 搜索 | 显示开关、结果数、书签与最近文件开关及数量、仅 Markdown、显示路径 |
| 片段 | 列出内置与用户片段及其路径、「打开 snippets 文件夹」按钮 |

## 命令与生命周期

- 命令：`打开首页`、`刷新所有卡片`、`在标签页打开仪表盘`、`新建卡片`。
- 「替换新标签页」：监听工作区空 leaf（`file-open` 拿到 null file 或 `layout-change`），把首页视图塞进该 leaf，与 Home Tab 同思路。
- `openOnStartup`：`layout-ready` 后打开。
- 文件变化：监听 `vault.on('modify')`，用自写标记避免插件自己写入时触发回声重渲染。

## CSS 片段发现与读取

- 内置片段在构建时由 esbuild 的 `text` loader 内联进 `main.js`（源码是 `src/builtin-snippets/*.css` 真实文件），发布产物仍只有 `main.js` / `manifest.json` / `styles.css` 三件套，零运行时 IO。
- 用户片段通过 `app.vault.adapter.list(configDir + '/snippets')` 列出，`adapter.read` 读取，按 mtime 做内存缓存。
- 片段引用格式：`builtin:名称` / `user:文件名`，选择器中分两组展示。
- 同一卡片可引用多个片段，按顺序注入。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `src/main.ts` | 插件入口、命令、事件、视图注册 |
| `src/settings.ts` | 设置类型、默认值、读写、版本迁移 |
| `src/dashboard/parse.ts` | 仪表盘文件文本 → section 数组（含围栏代码块跳过） |
| `src/dashboard/metadata.ts` | `%%card:%%` 注释的解析与生成 |
| `src/dashboard/edit.ts` | 生成增/删/改/移 section 后的新文件文本 |
| `src/dashboard/io.ts` | `vault.process` 原子写入、文件缺失处理 |
| `src/home-view.ts` | 首页 `ItemView`：页面骨架与编排 |
| `src/page-header.ts` | logo 与 wordmark |
| `src/background.ts` | 背景图层 |
| `src/search-bar.ts` | 搜索框与建议 |
| `src/card-grid.ts` | 网格布局与拖拽排序 |
| `src/card.ts` | 单卡片 DOM、Markdown 渲染、操作条 |
| `src/card-settings.ts` | 卡片设置弹窗 |
| `src/snippets.ts` | 片段发现与读取 |
| `src/snippet-scope.ts` | `@scope` 包裹与预处理 |
| `src/builtin-snippets/*.css` | 内置片段源码 |
| `styles.css` | 插件自身样式 |

分层原则沿用 Annotation Sidebar：`dashboard/parse.ts`、`dashboard/metadata.ts`、`dashboard/edit.ts`、`snippet-scope.ts`、`settings.ts` 都不依赖 Obsidian，可独立测试；视图层通过 `dashboard/io.ts` 访问文件。

## 构建

沿用 Annotation Sidebar 的工程约定：TypeScript 严格模式（`strict` + `noUncheckedIndexedAccess`）、esbuild 打包到 `dist/`（构建前清理旧产物，并把 `manifest.json` 与 `styles.css` 复制进去）、`tsc --noEmit` 类型检查、vitest、eslint + `eslint-plugin-obsidianmd`、`README.md` / `README.zh.md` / `CHANGELOG.md` / `versions.json`、GitHub Actions 构建与发布。

内置片段的 `text` loader 需要在 esbuild 配置里显式声明，否则打包会报未知扩展名。

## 测试策略

只测不依赖 Obsidian 的纯模块，与现有插件的 `core.ts` 做法一致：

| 模块 | 覆盖点 |
| --- | --- |
| `dashboard/parse.ts` | 围栏代码块（``` 与 ~~~、不同长度、语言后缀）内的标题不切分；行首识别；标题级别过滤；H1 与 frontmatter 忽略；字符区间准确 |
| `dashboard/metadata.ts` | 注释解析、多值、未知键保留、缺失注释的默认值、生成→解析往返一致 |
| `dashboard/edit.ts` | 增/删/改/移 section 后文件其余部分逐字节不变；空 section；末个 section 无结尾换行 |
| `snippet-scope.ts` | `@scope` 包裹、`:root` → `:scope`、优先级提升、`@import` 拒绝、多片段按序拼接 |
| `settings.ts` | 默认值合并、版本迁移、字段缺失容错 |
| 搜索排序 / 拖拽落点 | 纯计算部分 |

DOM 渲染与 Obsidian 交互不做单测。

## 验收标准

1. 仪表盘文件在 Obsidian 里作为普通笔记打开、编辑、搜索都正常，读起来是一篇正常笔记。
2. 卡片内纯文本、代码块、```` ```query ````、```` ```base ````、```` ```dataview ```` 均正确渲染（dataview 需安装对应插件）。
3. 卡片内 `![[某表.base]]`、`![[图片.png]]`、相对链接按仪表盘笔记的目录正确解析。
4. 给一张卡片加 `%%card: css=base%%`，样式只作用于该卡，不影响其他卡片与全局样式；卡片内其他元素不受影响。
5. 在卡片设置弹窗里改片段、跨列数、图标后，文件被正确改写，且其余 section 的文本逐字节未变。
6. 拖拽排序后，文件里的 section 顺序确实发生变化。
7. 在标签页里手写编辑仪表盘文件，首页卡片实时更新。
8. 关闭并重开首页视图，配置与渲染结果一致。
9. 在未安装 dataview 的环境下，dataview 代码块退化为普通代码块，不报错、不影响其他卡片。

## 已知限制与非目标

- 卡片正文里不能出现同级标题，否则会被切成两张卡片。
- `%%card:%%` 是 Obsidian 原生注释：阅读模式下自动隐藏，Live Preview 下会以暗色文字显示，这是原生行为而非插件引入了额外标记。
- `@scope` 依赖 Chromium 118+，因此 `minAppVersion` 为 1.9.0。
- 只支持一个仪表盘文件，不做多套仪表盘页面切换。
- `builtin:dataview` 需在安装 dataview 后实测校准选择器。
- 不做：卡片折叠、卡片嵌套卡片、每卡独立文件存储、卡片级内联编辑。
