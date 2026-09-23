import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contentStyleVariableNames } from "../src/content-styles";

/**
 * 守住静态 styles.css 里最容易静默失效的那一类写法。
 *
 * 为什么需要它：`.home-card-content` 与 `markdown-rendered` 是加在**同一个元素**上的
 * （见 card.ts），写成后代选择器 `.home-card-content .markdown-rendered` 会去匹配一个
 * 永远不存在的子元素——规则不报错、只是整条失效。内建的 text.css / code.css 就整份栽在
 * 这上面，而且验收时完全抓不到。CSS 不进 tsc/eslint，所以只能靠这道断言。
 */
const source = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

// 必须先剥注释再断言：styles.css 的注释里正当地提到了这些反面写法（就是为了说明它们不能用），
// 对整份原文做子串匹配会把那几句警告本身判成违规。snippet-registry.test.ts 早先也踩过同一个坑。
const stylesheet = source.replace(/\/\*[\s\S]*?\*\//g, " ");

describe("styles.css", () => {
  it("never treats markdown-rendered as a descendant of the card content", () => {
    expect(stylesheet).not.toContain(".home-card-content .markdown-rendered");
  });

  it("gates the table zebra stripes behind the root class and targets the real DOM", () => {
    expect(stylesheet).toContain(".home-card-content.markdown-rendered");
  });

  it("stripes data rows only, and not with a variable themes blank out", () => {
    // thead 不能被染色，所以条纹必须限定在 tbody 上
    expect(stylesheet).toContain("tbody");
    // --table-row-alt-background 在 Obsidian 默认是 transparent，很多主题还会把它写成
    // var(--table-background)，用它等于把开关做成"打开后什么都没发生"
    expect(stylesheet).not.toContain("--table-row-alt-background");
  });
});

describe("column layout contract", () => {
  /**
   * 竖向间距靠"多占行"来留，所以启用列布局时 row-gap 必须是 0；`rowSpan` 的换算正是按这个
   * 前提写的。若有人把这条规则删掉或改成非 0，卡片底部会凭空多出一大截，运行时才看得见。
   */
  it("zeroes row-gap only when the column layout is on", () => {
    expect(/\.home-tab-cards\.is-column-layout\s*\{[^}]*row-gap:\s*0/.test(stylesheet)).toBe(true);
  });

  /** 降级路径：没有 ResizeObserver 时不加 is-column-layout，普通 Grid 仍需保留卡片间距 */
  it("keeps a gap on the plain grid for the no-ResizeObserver fallback", () => {
    const plain = /\.home-tab-cards\s*\{([^}]*)\}/.exec(stylesheet);
    expect(plain).not.toBeNull();
    expect(plain?.[1]).toContain("gap:");
  });

  /**
   * 列数由 JS 单点决定（`primeColumnLayout` 写内联 `grid-template-columns`）。CSS 里再写死一份
   * 会在某个断点与内联值分叉；而在卡片渲染循环开始前就写内联值，正是"拖动后卡片先全宽再吸附"
   * 那个闪烁的修复手段——CSS 里补一份既多余又会打架。
   */
  it("leaves the column count to JS instead of hardcoding it in CSS", () => {
    const plain = /\.home-tab-cards\s*\{([^}]*)\}/.exec(stylesheet);
    expect(plain?.[1]).not.toContain("grid-template-columns");
    // 但 display: grid 必须留着：JS 只写模板与placement，不写 display
    expect(plain?.[1]).toContain("display: grid");
  });

  /**
   * 列数与每卡放置现在由 JS 单点决定并写成内联样式。样式表里任何带 `!important` 的
   * `grid-column` / `grid-template-columns` 都会压过内联样式，让窄屏或宽卡片静默错位——
   * 之前那条 `@media` 里的 `grid-column: auto !important` 就是为此被删的，别让它复辟。
   */
  it("never overrides the JS-written grid placement with !important", () => {
    const pattern = /(grid-column|grid-template-columns)\s*:[^;}]*!important/;
    expect(pattern.test(stylesheet), "stylesheet must not !important the grid placement").toBe(
      false,
    );
  });
});

/**
 * 取出选择器命中 `selectorPattern` 的规则块。
 *
 * 只按行找不行：本仓库的选择器是多行缩进书写的，规则头可能跨好几行。
 * `selectorPattern` 不要带 `g` 标志——这里会对同一条规则反复 `test`，带 `g` 会因 lastIndex
 * 残留而漏掉一半。
 */
function rulesMatching(
  css: string,
  selectorPattern: RegExp,
): { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = [];
  const pattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (selectorPattern.test(selector)) {
      found.push({ selector, body: match[2] ?? "" });
    }
  }
  return found;
}

function basesRules(css: string): { selector: string; body: string }[] {
  return rulesMatching(css, /\.bases-(tr|td|tbody)\b/);
}

describe("base bar style", () => {
  it("scopes the bar style to the card content", () => {
    expect(basesRules(stylesheet).length).toBeGreaterThan(0);
  });

  /**
   * 这是本功能存在的全部前提，也是最容易被"顺手优化"掉的一条。
   *
   * Bases 表格是虚拟滚动：`.bases-tr` / `.bases-td` 都是 position: absolute，left/top/width
   * 由 JS 逐行算出写进内联样式。一旦我们在 CSS 里改它们的定位或尺寸，就会与那套计算打架，
   * 出现行重叠、空白、滚动错位——而且是运行时才暴露，单测和构建都抓不到。所以在这里守住：
   * 命中这些元素的规则只允许做绘制。
   */
  it("never changes layout on the virtualised rows and cells", () => {
    const forbidden = ["position", "display", "height", "width", "top", "left", "inset", "flex"];
    for (const rule of basesRules(stylesheet)) {
      // 伪元素是我们自己新建的盒子，不属于 Bases 的虚拟布局，可以自由定位
      if (rule.selector.includes("::before")) {
        continue;
      }
      for (const property of forbidden) {
        expect(
          new RegExp(`(^|[;\\s])${property}\\s*:`).test(rule.body),
          `${rule.selector} must not set ${property}`,
        ).toBe(false);
      }
    }
  });

  it("keeps the row hover feedback the bar would otherwise cover", () => {
    // 负 z-index 的伪元素会盖住 .bases-tr 自身的 hover 背景，必须另给伪元素补一条
    expect(stylesheet).toContain(":hover::before");
  });

  it("leaves the summary rows alone, since Obsidian positions them differently", () => {
    // footer 与分组汇总行都是 .bases-tr，但带 !important 的定位，不该被当成数据行去画
    expect(stylesheet).toContain(":not(.bases-table-footer)");
    expect(stylesheet).toContain(":not(.bases-table-group-summary-row)");
  });
});

describe("base toolbar hiding", () => {
  it("hides the whole header, which is the element that holds the toolbar", () => {
    const rule = basesRules(stylesheet).find((entry) =>
      entry.selector.includes("is-base-toolbar-hidden"),
    );
    // basesRules 只收 tr/td/tbody，表头不在其中——这里换个方式取规则体
    expect(rule).toBeUndefined();
    expect(
      /is-base-toolbar-hidden[^{]*\.bases-header\s*\{[^}]*display:\s*none/.test(stylesheet),
    ).toBe(true);
  });

  it("needs no !important, because show() only clears an inline none", () => {
    // app.js 里 show() 的实现是「仅当内联 display 为 none 时恢复成空串」，样式表规则不产生
    // 内联样式，所以守卫不成立、不会被覆盖。写了 !important 反而会挡住 Obsidian 自己
    // 在错误态/query 态下对表头的合法切换。
    const match = /is-base-toolbar-hidden[^{]*\.bases-header\s*\{([^}]*)\}/.exec(stylesheet);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toContain("!important");
  });
});

/**
 * 卡片外观（设置项「卡片」那一组）。
 *
 * 这组特性一半落成 CSS 变量、一半落成开闸类，两侧都只在运行时才看得出对不对，所以这里
 * 把注册表与样式表钉在一起。
 */
describe("card appearance", () => {
  /**
   * 每个注册表变量都必须被引用，且**每一处**引用都要带兜底。
   *
   * 没兜底时只要有一次没走整页 render（变量还没写到根节点上），`border-radius: var(--x)` 就
   * 成了无效声明、整条声明被丢弃，卡片会突然变成直角。
   *
   * 注意不能只断言「存在一处带兜底的引用」：同一个变量可能被引用多次（`--home-tab-card-radius`
   * 在圆角与浮动操作条的内缩里各用了一次），那样漏掉兜底的那一处会被另一处掩盖。所以正向断言
   * 「被引用过」，反向断言「不存在无兜底的 var(--x)」。
   */
  it("references every registered variable, always with a fallback", () => {
    for (const name of contentStyleVariableNames()) {
      expect(stylesheet.includes(`var(${name},`), `${name} is never used with a fallback`).toBe(
        true,
      );
      const bare = new RegExp(`var\\(\\s*${name}\\s*\\)`);
      expect(bare.test(stylesheet), `${name} is used without a fallback somewhere`).toBe(false);
    }
  });

  /** 反向：只查 card 前缀——另外三个 --home-tab-* 不是注册表管的（logo 缩放、两个供用户覆盖的兜底） */
  it("has no card variable in the stylesheet that the registry does not declare", () => {
    const declared = new Set(contentStyleVariableNames());
    // --home-tab-card-shadow 是留给用户覆盖投影颜色的，不是设置项，单独放行
    declared.add("--home-tab-card-shadow");
    for (const used of new Set(stylesheet.match(/--home-tab-card-[a-z-]+/g) ?? [])) {
      expect(declared.has(used), `stylesheet uses ${used}, which no feature declares`).toBe(true);
    }
  });

  /**
   * 红线：`.home-card-header` 永远不能被整个隐藏。
   *
   * 拖拽手柄与设置、编辑、删除三个按钮都在它里面（见 card.ts 的构造），一旦 `display: none`，
   * 这些卡片就只能去笔记里手改——而且没有任何报错。「隐藏标题」必须只藏 title 与 icon。
   */
  it("never hides the header, which holds the drag handle and the action buttons", () => {
    for (const rule of rulesMatching(stylesheet, /\.home-card-header\s*$/)) {
      expect(
        /(^|[;\s])display\s*:\s*none/.test(rule.body),
        `${rule.selector} must not hide the header`,
      ).toBe(false);
    }
  });

  /**
   * 浮动操作条要能锚在卡片上，卡片就必须自建包含块。
   *
   * `.home-tab-cards` 自己是 `position: relative`（拖拽落点指示线的包含块），所以少了这条，
   * 绝对定位的 header 会一路锚到网格——所有卡片的操作条叠在网格右上角同一处。
   */
  it("gives the card a containing block before floating the header", () => {
    const cardRule = rulesMatching(stylesheet, /is-card-title-hidden \.home-card$/)[0];
    expect(cardRule, "the floating header needs .home-card to be positioned").toBeDefined();
    expect(cardRule?.body).toMatch(/position:\s*relative/);

    const headerRule = rulesMatching(stylesheet, /is-card-title-hidden \.home-card-header$/)[0];
    expect(headerRule).toBeDefined();
    expect(headerRule?.body).toMatch(/position:\s*absolute/);
    // 不可见的操作条若还接事件，卡片顶部会有一条隐形带子吞掉正文的点击与文本选中
    expect(headerRule?.body).toMatch(/pointer-events:\s*none/);
  });

  /**
   * 浮动操作条必须同时有 `z-index` 与卡片上的 `isolation: isolate`，两者缺一不可。
   *
   * 少了 z-index：`.markdown-rendered pre` 是 `position: relative`（Obsidian 的复制按钮要锚在
   * 它上面），它与 header 都是 `z-index: auto` 的定位元素，于是按 DOM 顺序绘制——header 在
   * 内容之前，每个代码块都会盖住操作条，只露出上半截。这条曾经写成「断言不得有 z-index」，
   * 把那个 bug 一起固化了，所以这里正反两面都钉住。
   *
   * 少了 isolation：header 的 z-index 会跑到网格那一层，和 `.home-card-drop-indicator`
   * （网格的子元素、`z-index: 3`）比大小，取值一旦超过 3 就会把拖拽指示线压住。
   */
  it("lifts the floating header above positioned content, but only inside its own card", () => {
    const headerRule = rulesMatching(stylesheet, /is-card-title-hidden \.home-card-header$/)[0];
    expect(headerRule?.body, "the header must be lifted above code blocks").toMatch(
      /(^|[;\s])z-index:\s*\d/,
    );
    const cardRule = rulesMatching(stylesheet, /is-card-title-hidden \.home-card$/)[0];
    expect(cardRule?.body, "the card must isolate that z-index from the drop indicator").toMatch(
      /isolation:\s*isolate/,
    );
  });
});

/**
 * 设置页的折叠块（品牌区 / 背景 / 搜索，以及「内容样式」下按内容类型分的三组）。
 *
 * 这些类名同时写在 `settings-tab.ts` 与 `styles.css` 两处，对不上的后果是「块还在、样式没了」：
 * CSS 不进 tsc/eslint、构建也不报错，只有人肉打开设置页才看得出来。所以在这里把两边钉在一起。
 */
describe("settings page collapsible blocks", () => {
  const tabSource = readFileSync(
    fileURLToPath(new URL("../src/settings-tab.ts", import.meta.url)),
    "utf8",
  );
  const collapseClasses = (text: string): Set<string> =>
    new Set(text.match(/home-tab-collapse[a-z-]*/g) ?? []);

  it("keeps the class names in settings-tab.ts and styles.css in sync", () => {
    const inTab = collapseClasses(tabSource);
    const inCss = collapseClasses(stylesheet);
    expect(inTab.size).toBeGreaterThan(0);
    for (const name of inTab) {
      expect(inCss.has(name), `styles.css has no rule for .${name}`).toBe(true);
    }
    for (const name of inCss) {
      expect(inTab.has(name), `settings-tab.ts no longer creates .${name}`).toBe(true);
    }
    // 改名前的旧类名：settings-tab.ts 已经不再创建它，样式表里若还留着就是一条死规则
    expect(stylesheet).not.toContain("home-tab-style-group");
  });

  /**
   * 图标 id 必须是不带前缀的 `right-triangle`。
   *
   * `getIcon` 查两张互不相通的表：带 `lucide-` 前缀的剥掉前缀查 lucide 表，不带前缀的才查
   * Obsidian 自有表；而 `right-triangle` 只在自有表里。写成 `lucide-right-triangle` 会查不到、
   * 返回 null，`setIcon` 什么都不画——箭头静默消失且不报错。这条断言防的正是「顺手给它补上
   * lucide- 前缀以统一风格」这个很自然的改动。
   */
  it("uses the unprefixed icon id, which is the only table that has it", () => {
    // 按行取 setIcon 调用里的最后一个字符串字面量，而不是对整份源码做子串匹配：那段代码的
    // 注释里正当地写着「不能写成 lucide-right-triangle」，子串匹配会把这句警告本身判成违规。
    // 也不能用 `setIcon\([^)]*,\s*"…"\)` 这种正则——实参里 `createSpan({…})` 自带闭括号，
    // `[^)]*` 会提前停住，什么都匹配不到。
    const iconIds = tabSource
      .split(/\r?\n/)
      .filter((line) => line.includes("setIcon("))
      .map((line) => [...line.matchAll(/"([^"]+)"/g)].at(-1)?.[1] ?? "");
    expect(iconIds).toContain("right-triangle");
    expect(iconIds).not.toContain("lucide-right-triangle");

    /*
     * 反过来的一例，放在一起是为了让「两张表」这件事不被忘掉：重置按钮用的 `rotate-ccw`
     * 属于 **lucide 表**，所以它必须**带** `lucide-` 前缀；漏了前缀会去查 Obsidian 自有表，
     * 同样查不到、同样静默无图标。判断依据不是名字长相，而是它在哪张表里。
     */
    expect(iconIds).toContain("lucide-rotate-ccw");
    expect(iconIds).not.toContain("rotate-ccw");
  });

  /**
   * 旋转必须落在**收起**态上。
   *
   * `right-triangle` 的 path（`M3 8L12 17L21 8`）本身是朝下的 V，所以展开态不该有任何
   * transform，Obsidian 自己也是 `.collapse-icon.is-collapsed svg` 才旋转。写成「展开时转」
   * 会让两个状态同时错：收起朝下、展开朝左。
   *
   * 这条断言是修正过的——上一版写成「转向只在 `[open]` 上」，那恰好把写反的实现判为合格，
   * 是一个测试通过但行为错误的例子。
   */
  it("rotates the arrow in the collapsed state, not the open one", () => {
    const arrowRules = rulesMatching(stylesheet, /home-tab-collapse-arrow\s+svg/);
    const rotating = arrowRules.filter((rule) => /transform:\s*rotate\(/.test(rule.body));
    expect(rotating).toHaveLength(1);
    expect(rotating[0]?.selector, "only the collapsed state may rotate").toContain(":not([open])");
    // 基础规则只放尺寸与过渡；它同时是展开态的样式，带上 transform 就会转错方向
    const baseRule = arrowRules.find((rule) => !rule.selector.includes(":not([open])"));
    expect(baseRule, "the base arrow rule must exist").toBeDefined();
    // 只认声明 `transform: ...`，不能对整段做子串匹配：基础规则里的 `transition: transform`
    // 正当地提到了这个词，子串匹配会把那句过渡判成违规（本仓库在注释上踩过同一个坑）。
    expect(/(^|[;\s])transform\s*:/.test(baseRule?.body ?? "")).toBe(false);
  });

  /**
   * `summary` 被设成 flex 容器后浏览器不再渲染原生的 disclosure marker，但同一主题的规则若把
   * `display` 抢回 `list-item`，原生三角会与我们自己画的箭头同时出现，变成两个箭头。
   */
  it("suppresses the native disclosure marker as well", () => {
    const rule = rulesMatching(stylesheet, /^\.home-tab-collapse-summary$/)[0];
    expect(rule).toBeDefined();
    expect(rule?.body).toContain("list-style: none");
  });
});
