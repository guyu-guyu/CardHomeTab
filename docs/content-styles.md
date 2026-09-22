# 内容样式开关：代码编写规范

「内容样式」是设置页里按内容类型分组的一组开关（表格、Base……），用来统一调整卡片内某类内容的呈现，让常见需求不必自己写 CSS 片段。本文是往这套机制里增删特性时的规范。

## 设计前提

- **每个特性是独立的布尔开关，不是「选一种样式」。** 它们彼此正交、可任意组合，所以不要把多个特性挤进一个枚举——那会强制互斥。
- **一律默认关闭。** 这些开关改变的是用户笔记的观感，不该在升级后凭空生效。
- **规则只写在静态 `styles.css` 里，由首页根节点上的开闸类控制。** 不要运行时注入样式：`obsidianmd/no-forbidden-elements` 禁止创建 `<style>` 元素；而 `adoptedStyleSheets`（`card.ts` 里每卡片片段走的那条路）是 document 级的，popout 窗口要自己重挂，反而更麻烦。Obsidian 会自动把插件的 `styles.css` 注入 popout 的 `<head>`，静态文件是唯一零成本跨窗口的通道。

## 单一事实来源

`src/content-styles.ts` 里的 `CONTENT_STYLE_GROUPS` 是唯一的声明处，同时驱动三个消费方：

| 消费方 | 用途 |
| --- | --- |
| `src/settings.ts` | `ContentStyleKey` 由注册表**类型推导**；`CardHomeTabSettings extends ContentStyleSettings`；`mergeSettings` 遍历注册表读取 |
| `src/settings-tab.ts` | 遍历 group 渲染折叠块、遍历 feature 渲染开关 |
| `src/home-view.ts` | 遍历 feature 往 `rootEl` 上开闸类 |

`as const` 不能去掉：键的字面量类型是从这张表推导出来的，去掉后 `key` 退化成 `string`，设置对象就不再受类型约束。

## 新增一个特性

只有两步：

**1. 在 `CONTENT_STYLE_GROUPS` 里加一条 feature**（已有分类就加进去，新分类则加一个 group）：

```ts
{
  key: "tableCompact",            // 设置键，也是 data.json 里的字段名
  className: "is-table-compact",  // 首页根节点上的开闸类
  name: "紧凑行高",                // 设置页显示名
  description: "……",              // 设置页说明
}
```

**2. 在根目录 `styles.css` 里写规则**，选择器形如：

```css
.home-tab-root.is-table-compact .home-card-content.markdown-rendered … { … }
```

其余全自动：类型系统会要求 `DEFAULT_SETTINGS` 补上默认值（漏了编译不过），设置页会多出开关，`home-view` 会开闸类。

## 硬规则

### 选择器

- **`.home-card-content` 与 `markdown-rendered` 必须连写。** 它们在同一个元素上，写成 `.home-card-content .markdown-rendered` 会去找一个不存在的子元素，整条规则是死的——内建片段 `text.css` / `code.css` 曾整份栽在这上面，且验收时完全抓不到。
- **开闸类挂在 `.home-tab-root` 上**，用 Obsidian 的 `toggleClass(class, value)` 幂等赋值。不要用 `addClass`：`rootEl` 在 `onOpen()` 建一次、`render()` 只清空其内容，它本身跨次渲染存活，`addClass` 会让关掉开关后仍残留。
- 需要用户可覆盖的颜色时留一个 CSS 变量兜底：`var(--home-tab-xxx, var(--fallback))`。

### 颜色变量

别用那些**主题可能置空**的语义变量。`--table-row-alt-background` 就是个陷阱：Obsidian 默认把它设为 transparent，不少主题还显式写成 `var(--table-background)`，用它等于把开关做成「打开后什么都没发生」。优先选在任何主题里都必须可见的叠加色，例如 `--background-modifier-hover`。

### 碰 Bases（base 视图）时

Bases 的三种视图（表格 / 卡片 / 列表）**全部是虚拟滚动**，`.bases-tr`、`.bases-td`、`.bases-cards-item`、`.bases-list-item` 都是 `position: absolute`，`left` / `top` / `width` 由 JS 逐个算出来写在内联样式上。

- **只做绘制，不改布局。** 绝不在这些元素上声明 `position` / `display` / `height` / `width` / `top` / `left` / `inset` / `flex`——会与 JS 的定位和高度计算打架，结果是行重叠、空白或滚动错位，且只在运行时暴露。`tests/styles.test.ts` 有一条守卫钉死这一点。
- **需要色块和间距时用 `::before`**，而不是给行本身加 `background` + `border`：加 border/padding 会改变绝对定位子元素（那些单元格）的包含块，把它们整体顶偏。伪元素用 `inset: 2px 0` 上下内缩，既做出间距又完全不动行自身的盒子；配 `isolation: isolate` 让负 `z-index` 停在本行内。
- **补 hover 变体。** Bases 的行悬停是设在行自身 `background` 上，而负 `z-index` 的伪元素会盖在元素自身背景之上，不补 `:hover::before` 会把悬停反馈整个吃掉。
- **排除汇总行。** `.bases-table-footer` 与 `.bases-table-group-summary-row` 也是 `.bases-tr`，但带 `!important` 的定位，不是数据行。
- **隐藏类的开关不要加 `!important`。** Obsidian 自己会调 `viewHeaderEl.toggle()/.show()`，而 `show()` 的实现是「仅当**内联** `display` 为 `none` 时才恢复成空串」。样式表规则不产生内联样式，守卫不成立，所以普通 `display: none` 不会被覆盖；加了 `!important` 反而会挡住 Obsidian 在错误态/query 态下对表头的合法切换。

### 文案

UI 文案一律中文，并受 `obsidianmd/ui/sentence-case` 约束（`--max-warnings 0`，且该规则受 `eslint-comments/no-restricted-disable` 保护、不能用行内注释绕过）。句中的 `base` 要小写：`隐藏 base 工具栏` 合规，`隐藏 Base 工具栏` 会报错；句首则可大写（`Base 样式`）。

## 核实 Obsidian 内部类名的方法

不要照抄第三方插件的 CSS 或旧文档里的类名——`.obsidian/plugins` 下的片段会出现 Obsidian 本体并不发出的类（`.search-result-file-path`、`.block-language-query` 在本体里出现 0 次）。从正在运行的版本里反查：

```bash
# app.css / app.js 都在 asar 里，用 node 读它的头部再按 offset 取出
node -e '…读 obsidian-<版本>.asar 的 header，dump app.css…'
grep -n "bases-tr" app.css
```

判断一个元素能否安全隐藏，要同时确认 JS 没有读它的尺寸（`offsetHeight` / `clientHeight` / `getBoundingClientRect`）。

## 守卫测试

`tests/content-styles.test.ts` 与 `tests/styles.test.ts` 覆盖了这套机制最容易静默失效的地方，改动后都要保持绿：

- 注册表里每个 `className` 都必须在 `styles.css` 里出现——防「注册了却没写样式」的空开关。
- 反向：`styles.css` 里出现的 `is-*` 开闸类都必须在注册表里——防改名后留下死规则。
- 每个特性默认为 `false`，且能被 `mergeSettings` 读回——防「开关能点、重启后失效」。
- 命中 `.bases-tr` / `.bases-td` / `.bases-tbody` 的规则不得声明布局属性。
- `styles.css` 里不得出现 `.home-card-content .markdown-rendered` 这种带空格的死写法。

CSS 不进 `tsc` 也不进 `eslint`，这些断言是唯一的自动化防线。新增特性时，如果它引入了新的「可能静默失效」的形态，请一并补一条守卫。

> 注：`tests/` 下可以 `import` node 内建模块（读 `styles.css` 就靠 `node:fs`）。`eslint.config.mjs` 对 `tests/**` 关掉了 `obsidianmd/no-nodejs-modules`——那条规则针对的是会被打包进 `main.js` 的运行时代码，测试文件不进产物。`src/` 的门禁不受影响。
