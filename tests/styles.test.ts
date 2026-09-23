import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
 * 取出所有"选择器命中了 Bases 虚拟列表元素"的规则块。
 *
 * 只按行找不行：本仓库的选择器是多行缩进书写的，规则头可能跨好几行。
 */
function basesRules(css: string): { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = [];
  const pattern = /([^{}]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (/\.bases-(tr|td|tbody)\b/.test(selector)) {
      found.push({ selector, body: match[2] ?? "" });
    }
  }
  return found;
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
