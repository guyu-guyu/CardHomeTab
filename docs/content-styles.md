# 内容样式与卡片外观：代码编写规范

设置页「内容样式」是一组按类型分好的折叠块（卡片、表格、Base……），用来统一调整卡片的外观与卡片内某类内容的呈现，让常见需求不必自己写 CSS 片段。本文是往这套机制里增删特性时的规范。

## 设计前提

- **一个特性可以是开关、数值或枚举**（注册表里的 `kind`）。彼此正交、可任意组合，所以不要把多个独立特性挤进一个枚举——那会强制互斥。反过来，一个**本质上互斥**的选择（比如投影的三态）就该是枚举，不要拆成几个布尔。
- **默认值 = 插件此前写死的外观。** 这些设置改变的是用户看到的样子，不该在升级后凭空生效：内容类的特性默认关闭；卡片外观类的默认值必须等于它在 `styles.css` 里原本的硬编码值（圆角 8、间距 16、边框 1px solid、无投影、显示标题）。两侧的对应关系由 `EXPECTED_DEFAULTS` 钉死。
- **规则只写在静态 `styles.css` 里**，由首页根节点上的开闸类或 CSS 变量控制。不要运行时注入样式：`obsidianmd/no-forbidden-elements` 禁止创建 `<style>` 元素；而 `adoptedStyleSheets`（`card.ts` 里每卡片片段走的那条路）是 document 级的，popout 窗口要自己重挂，反而更麻烦。Obsidian 会自动把插件的 `styles.css` 注入 popout 的 `<head>`，静态文件是唯一零成本跨窗口的通道。

## 单一事实来源

`src/content-styles.ts` 里的 `CONTENT_STYLE_GROUPS` 是唯一的声明处，同时驱动三个消费方：

| 消费方 | 用途 |
| --- | --- |
| `src/settings.ts` | `ContentStyleKey` 与每个键的**值类型**由注册表推导；`CardHomeTabSettings extends ContentStyleSettings`；`mergeContentStyles` 按 `kind` 分派读取 |
| `src/settings-tab.ts` | 遍历 group 用 `collapsibleBlock()` 建折叠块，按 `kind` 渲染开关 / 滑块 / 下拉 |
| `src/home-view.ts` | `contentStyleGates()` → 开闸类，`contentStyleVariables()` → CSS 变量，两者都写在 `rootEl` 上 |

`as const` 不能去掉：键与枚举值的字面量类型都是从这张表推导出来的，去掉后会退化成 `string`，设置对象就不再受类型约束。`satisfies readonly StyleGroup[]` 负责结构校验（字段名写错、`kind` 与必填字段不匹配都会在这里报错）。

## 三种 kind

| kind | 落地方式 | 适用 |
| --- | --- | --- |
| `toggle` | 开闸类。`invert: true` 表示「默认外观即开」，类只在值为 `false` 时挂 | 显示卡片标题、斑马条纹 |
| `number` | CSS 变量，**单位在 JS 侧拼好** | 圆角、间距、边框粗细 |
| `enum` + `variable` | CSS 变量，值直接写进去 | 边框样式（`none/solid/dashed/dotted`） |
| `enum` 无 `variable` | 值拼类名，每个 option 自带 `className` | 投影三态（`hover` 需要独立的 `:hover` 选择器，单个变量值表达不了） |

几条不显眼但会静默失效的规则：

- **单位必须在 JS 侧拼**（`8` → `"8px"`），不要在 CSS 里 `calc(var(x) * 1px)`：后者要求变量值是无单位数，那样兜底就写不成 `var(--home-tab-card-radius, var(--radius-m))` 了——`--radius-m` 本身带 px。
- **每一处 `var()` 引用都要带兜底。** 少了兜底，只要有一次没走整页 `render()`（变量还没写到根节点上），整条声明就会被丢弃。守卫是反向断言「不存在无兜底的 `var(--x)`」，因为同一个变量可能被引用多次，只检查「存在一处带兜底」会被另一处掩盖。
- **枚举要把每个候选类都产出一条** gate（选中的 `true`、其余 `false`），这样调用方一律 `toggleClass` 就够了。只产出选中那个的话切换时摘不掉旧类，而设置页重建后「上一个值」已无处可查。
- **变量只在整页 `render()` 里写**，`refreshCards()` 那条轻路径不碰。卡片间距参与列布局的行距换算（`placeCards` 读 `getComputedStyle(gridEl).columnGap`），所以变量必须在建 `gridEl` **之前**就位。任何未来「改了卡片外观但不走整页 render」的路径都会静默失效。
- `feature.options` / `group.features` 都是**元组联合**，直接 `.map()` 或 for-of 会撞 TS「union has signatures but none compatible」，一律先经 `enumOptions()` / `groupFeatures()` 拓宽。
- `settings[key] = value` 写不了（键是联合，值要能赋给所有候选属性类型的**交集**，而两个枚举键的交集是 `never`），统一走 `writeContentStyle()`——那是全仓唯一一处断言。

## 新增一个特性

只有两步：

**1. 在 `CONTENT_STYLE_GROUPS` 里加一条 feature**（已有分类就加进去，新分类则加一个 group）：

```ts
{
  kind: "number",
  key: "cardPadding",                    // 设置键，也是 data.json 里的字段名
  variable: "--home-tab-card-padding",   // CSS 变量名
  unit: "px",
  min: 0, max: 32, step: 1,
  name: "内边距",
  description: "……",
}
```

**2. 在根目录 `styles.css` 里写规则**，变量型带兜底、开闸类型挂在 `.home-tab-root` 上：

```css
.home-card { padding: var(--home-tab-card-padding, var(--size-4-3)); }
.home-tab-root.is-table-compact .home-card-content.markdown-rendered … { … }
```

其余全自动：类型系统会要求 `DEFAULT_SETTINGS` 与测试里的 `EXPECTED_DEFAULTS` 补上默认值（漏了**编译不过**），设置页会多出对应控件，`home-view` 会写类或变量。

## 硬规则

### 选择器

- **`.home-card-content` 与 `markdown-rendered` 必须连写。** 它们在同一个元素上，写成 `.home-card-content .markdown-rendered` 会去找一个不存在的子元素，整条规则是死的——内建片段 `text.css` / `code.css` 曾整份栽在这上面，且验收时完全抓不到。
- **开闸类挂在 `.home-tab-root` 上**，用 Obsidian 的 `toggleClass(class, value)` 幂等赋值。不要用 `addClass`：`rootEl` 在 `onOpen()` 建一次、`render()` 只清空其内容，它本身跨次渲染存活，`addClass` 会让关掉开关后仍残留。
- 需要用户可覆盖的颜色时留一个 CSS 变量兜底：`var(--home-tab-xxx, var(--fallback))`。

### 颜色变量

别用那些**主题可能置空**的语义变量。`--table-row-alt-background` 就是个陷阱：Obsidian 默认把它设为 transparent，不少主题还显式写成 `var(--table-background)`，用它等于把开关做成「打开后什么都没发生」。优先选在任何主题里都必须可见的叠加色，例如 `--background-modifier-hover`。

### 碰卡片自身结构时

卡片的 DOM 是 `.home-card > (.home-card-header > [.home-card-icon, .home-card-title, .home-card-actions], .home-card-content)`，而**拖拽手柄与设置、编辑、删除三个按钮都在 `.home-card-actions` 里、也就是在 header 里面**。由此两条红线：

- **绝不能 `.home-card-header { display: none }`。** 藏掉它等于同时废掉拖拽排序、编辑、删除与卡片设置，之后只能去笔记里手改——而且不报任何错。「隐藏标题」只藏 `.home-card-title` 与 `.home-card-icon`，header 本身改为绝对定位浮到右上角。
- **浮动 header 之前，`.home-card` 必须自己 `position: relative`。** `.home-tab-cards` 本身就是 `position: relative`（拖拽落点指示线的包含块），卡片不自建包含块的话，绝对定位的 header 会一路锚到**网格**上——所有卡片的操作条叠在网格右上角同一处。
- **浮动 header 必须有 `z-index`，同时 `.home-card` 必须 `isolation: isolate`，两者缺一不可。** 「定位元素本就在流内容之上」只对**非定位**内容成立，而 Obsidian 的 `.markdown-rendered pre` 是 `position: relative`（复制按钮要锚在它上面）。两者都是 `z-index: auto` 的定位元素时按 DOM 顺序绘制，header 在内容之前，于是每个代码块都会盖住操作条、只露出上半截。callout、嵌入、base 视图里也有用到 `z-index` 的内容，所以取一个宽裕的值；而 `isolation` 保证这个值只在本张卡片内部生效，不会跑到网格那一层去和 `z-index: 3` 的落点指示线比大小。

配套的几点：浮动后要清 `margin-bottom`（否则它作用在绝对定位盒上、把操作条下移）、给 `width: auto`（否则一条透明带子横在卡片顶部吃掉正文的点击与文本选中）、不可见时 `pointer-events: none`、右侧内缩按圆角用 `max()`（`overflow: hidden` 的裁剪沿圆角曲线走，圆角调大时固定内缩会切掉操作条一角）。

### 碰 Bases（base 视图）时

Bases 的三种视图（表格 / 卡片 / 列表）**全部是虚拟滚动**，`.bases-tr`、`.bases-td`、`.bases-cards-item`、`.bases-list-item` 都是 `position: absolute`，`left` / `top` / `width` 由 JS 逐个算出来写在内联样式上。

- **只做绘制，不改布局。** 绝不在这些元素上声明 `position` / `display` / `height` / `width` / `top` / `left` / `inset` / `flex`——会与 JS 的定位和高度计算打架，结果是行重叠、空白或滚动错位，且只在运行时暴露。`tests/styles.test.ts` 有一条守卫钉死这一点。
- **需要色块和间距时用 `::before`**，而不是给行本身加 `background` + `border`：加 border/padding 会改变绝对定位子元素（那些单元格）的包含块，把它们整体顶偏。伪元素用 `inset: 2px 0` 上下内缩，既做出间距又完全不动行自身的盒子；配 `isolation: isolate` 让负 `z-index` 停在本行内。
- **补 hover 变体。** Bases 的行悬停是设在行自身 `background` 上，而负 `z-index` 的伪元素会盖在元素自身背景之上，不补 `:hover::before` 会把悬停反馈整个吃掉。
- **排除汇总行。** `.bases-table-footer` 与 `.bases-table-group-summary-row` 也是 `.bases-tr`，但带 `!important` 的定位，不是数据行。
- **隐藏类的开关不要加 `!important`。** Obsidian 自己会调 `viewHeaderEl.toggle()/.show()`，而 `show()` 的实现是「仅当**内联** `display` 为 `none` 时才恢复成空串」。样式表规则不产生内联样式，守卫不成立，所以普通 `display: none` 不会被覆盖；加了 `!important` 反而会挡住 Obsidian 在错误态/query 态下对表头的合法切换。

### 文案

UI 文案一律中文，并受 `obsidianmd/ui/sentence-case` 约束（`--max-warnings 0`，且该规则受 `eslint-comments/no-restricted-disable` 保护、不能用行内注释绕过）。句中的 `base` 要小写：`隐藏 base 工具栏` 合规，`隐藏 Base 工具栏` 会报错；句首则可大写（`Base 样式`）。

### 设置页的折叠块

- **统一用 `settings-tab.ts` 的 `collapsibleBlock(parent, key, name, description)`**，不要自己写 `<details>/<summary>`：箭头、以及展开态在整页重建后的保留，都只在那一个方法里实现一次。
- **箭头必须是 `summary` 的第一个子元素**（`styles.css` 的选择器按这个顺序写）。
- **图标 id 是不带前缀的 `right-triangle`，绝不能写成 `lucide-right-triangle`。** `getIcon` 查两张**互不相通**的表：带 `lucide-` 前缀的剥掉前缀查 lucide 表，不带前缀的才查 Obsidian 自有表；`right-triangle` 只在自有表里（Obsidian 自己的树状图、属性面板、编辑器折叠三处折叠指示用的都是这个名字）。写错的后果是 `getIcon` 返回 `null`、`setIcon` 什么都不画——箭头静默消失且不报任何错。
- **要旋转的是「收起」态，不是「展开」态。** `right-triangle` 的 path 是 `M3 8L12 17L21 8`，本身就是朝下的 V，所以展开态不需要任何 `transform`，只给 `:not([open])` 加 `rotate(calc(var(--direction, 1) * -1 * 90deg))`（带 `--direction` 是为了 RTL 下自动镜像，与本体一致）。反过来写成「展开时转 90deg」会让两个状态同时错：收起朝下、展开朝左。尺寸（10px）、描边（4px）、过渡（100ms）沿用 app.css 的 `.collapse-icon`。
- 折叠块必须自带箭头：`summary` 被设成 flex 容器后，浏览器不再渲染原生的 disclosure marker。但同主题的规则可能把 `display` 抢回 `list-item`，所以 `summary` 上要留 `list-style: none`，否则会出现两个三角。
- **展开态要自己记**（tab 实例上的 `expandedBlocks`）：改动「Logo 类型」与点「刷新列表」都会 `renderTab()` 整页重建，不记的话用户刚展开的块会自己合上。
- **每个折叠块都要声明它管哪些设置键**（`collapsibleBlock` 的第 5 个参数）。标题右侧的「重置」按钮靠它判断「这一块有没有被改过」，也靠它决定重置范围。内容样式那几组的键从注册表推导；「品牌区 / 背景 / 搜索」是手写控件，代码里无从反推，所以在 `settings.ts` 的 `SETTING_SECTION_KEYS` 里显式列出。`tests/settings.test.ts` 有一条完备性守卫（分区 + 注册表 + 两个非设置项 = 全部键），新增设置项忘了归类会红——否则那个设置永远不参与重置，而且界面上看不出任何异常。
- **重置按钮必须 `preventDefault()` + `stopPropagation()`。** 它在 `<summary>` 里，而点 summary 的默认行为是展开/收起 details，不拦住的话点「重置」会顺带把块折起来，看着像重置失败。重置后走整页 `renderTab()` 而不是只更新按钮：块里的滑块与下拉都持有旧值，不重建的话它们仍显示改动前的位置。
- 守卫：`tests/styles.test.ts` 把 `settings-tab.ts` 与 `styles.css` 里的 `home-tab-collapse*` 类名双向对齐（任一侧漏改都会红），并断言图标 id 的表归属（见下）、旋转只出现在 `:not([open])` 上、`summary` 关掉了原生 marker。

## 核实 Obsidian 内部类名的方法

不要照抄第三方插件的 CSS 或旧文档里的类名——`.obsidian/plugins` 下的片段会出现 Obsidian 本体并不发出的类（`.search-result-file-path`、`.block-language-query` 在本体里出现 0 次）。从正在运行的版本里反查：

```bash
# app.css / app.js 都在 asar 里，用 node 读它的头部再按 offset 取出
node -e '…读 obsidian-<版本>.asar 的 header，dump app.css…'
grep -n "bases-tr" app.css
```

判断一个元素能否安全隐藏，要同时确认 JS 没有读它的尺寸（`offsetHeight` / `clientHeight` / `getBoundingClientRect`）。

### 图标 id 要确认它在哪张表里

`getIcon` 的实现（1.13.7）是：

```js
e.startsWith("lucide-") ? 查 lucide 表(e.substring(7)) : 查 Obsidian 自有表(e)
```

两张表**互不相通**，查不到就返回 `null`，`setIcon` 随之什么都不画——图标静默消失，不报错、构建也不拦。

所以「在 `app.js` 里 grep 到了这个名字」**不足以**说明 id 写法正确：`right-triangle` 的名字确实在，但它属于自有表，写成 `lucide-right-triangle` 依然查不到。折叠箭头就在这上面栽过一次。反过来也一样——重置按钮用的 `rotate-ccw` 属于 lucide 表，漏掉前缀同样查不到。**判断依据是它在哪张表里，不是名字长相。** 可靠的确认方式有两条：

- 看它的值形态：自有表的值是 SVG 字符串（`"right-triangle":'<path .../>'`），lucide 表的值是数组（`"rotate-ccw":[…]`）。
- 直接看 Obsidian 自己怎么调：`grep -o 'Ag([^,]*, *"right-triangle"' app.js` 能看到本体三处折叠指示用的都是不带前缀的名字。

最省事的确认办法其实是在开发者控制台里跑一次公开 API：`getIconIds().filter(id => id.includes("triangle"))`，它返回的就是全部可用 id（自有图标不带前缀，lucide 图标带 `lucide-` 前缀）。

## 守卫测试

`tests/content-styles.test.ts` 与 `tests/styles.test.ts` 覆盖了这套机制最容易静默失效的地方，改动后都要保持绿：

- 注册表里每个开闸类都必须在 `styles.css` 里出现——防「注册了却没写样式」的空开关。
- 反向：`styles.css` 里出现的 `is-*` 开闸类都必须在注册表里——防改名后留下死规则。
- 每个注册表变量都必须被引用，且**每一处**引用都带兜底；反向：`--home-tab-card-*` 都必须被注册表声明。
- 默认值逐键钉表（`EXPECTED_DEFAULTS`，`satisfies` 保证漏键则测试文件编译不过），覆盖「默认值 = 此前外观」。
- 每个特性都能被 `mergeSettings` 读回——防「开关能点、重启后失效」。**探针值必须与默认值不同**，否则这条测试是空转（从前靠「默认 false、探针 true」隐式成立，多类型后必须按 kind 强制生成不同值）。
- 数值越界被钳到范围内，类型不对时回落默认值；枚举默认值必须是合法选项（否则下拉框打开是空白）。
- 数值型变量的输出必须带单位。
- 命中 `.bases-tr` / `.bases-td` / `.bases-tbody` 的规则不得声明布局属性。
- `.home-card-header` 不得被 `display: none`；浮动它时 `.home-card` 必须 `position: relative` 且 `isolation: isolate`、header 必须有 `pointer-events: none` 与 `z-index`。**这一条原先写的是「不得有 z-index」，把「代码块盖住操作条」那个 bug 一起固化了**——守卫只能锁住写它的人当时以为对的事，所以正反两面都要钉。
- `styles.css` 里不得出现 `.home-card-content .markdown-rendered` 这种带空格的死写法。
- 设置页折叠块：`settings-tab.ts` 与 `styles.css` 的 `home-tab-collapse*` 类名必须一一对应，图标 id 不带 `lucide-` 前缀，旋转只能写在 `:not([open])` 上，`summary` 必须关掉原生 marker（详见上文「设置页的折叠块」）。

CSS 不进 `tsc` 也不进 `eslint`，这些断言是唯一的自动化防线。新增特性时，如果它引入了新的「可能静默失效」的形态，请一并补一条守卫。

> 注：`tests/` 下可以 `import` node 内建模块（读 `styles.css` 就靠 `node:fs`）。`eslint.config.mjs` 对 `tests/**` 关掉了 `obsidianmd/no-nodejs-modules`——那条规则针对的是会被打包进 `main.js` 的运行时代码，测试文件不进产物。`src/` 的门禁不受影响。
