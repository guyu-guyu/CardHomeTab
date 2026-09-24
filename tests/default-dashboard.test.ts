import { describe, expect, it } from "vitest";
import { defaultDashboard } from "../src/dashboard/default-content";
import { DEFAULT_CARD_META } from "../src/dashboard/metadata";
import { parseDashboard, sectionBody, type CardSection } from "../src/dashboard/parse";
import { DEFAULT_SETTINGS } from "../src/settings";

const LEVEL = DEFAULT_SETTINGS.cardHeadingLevel;

/**
 * 卡片正文没有存在 section 上（`CardSection` 只有字符区间），要经 `sectionBody(text, section)`
 * 现算——`home-view.ts` 里渲染时也是这么取的。
 */
function bodiesOf(text: string, level = LEVEL): string[] {
  return parseDashboard(text, level).map((section: CardSection) => sectionBody(text, section));
}

/** 取出卡片正文里那个 base 代码块的 YAML 内容 */
function baseYaml(body: string): string {
  const match = /```base\n([\s\S]*?)\n```/.exec(body);
  return match?.[1] ?? "";
}

describe("default dashboard", () => {
  const dashboard = defaultDashboard({ headingLevel: LEVEL, dashboardPath: "Home.md" });

  /**
   * 最关键的一条：这份默认内容必须真的能切出两张卡片。
   *
   * 模板里嵌着 ```base 围栏，而标题解析是**围栏感知**的（fences.ts）——标题级别若与
   * 设置不一致、或围栏把标题吞进去，切出来的就不是两张卡，页面会静默地变成一张或三张。
   */
  it("splits into exactly the two intended cards", () => {
    const sections = parseDashboard(dashboard, LEVEL);
    expect(sections.map((s) => s.title)).toEqual(["最近修改", "最近创建"]);
  });

  it("follows the configured heading level instead of hardcoding H2", () => {
    // 用户把卡片标题级别改成 3 时，默认内容必须跟着用 ###，否则一张卡都切不出来
    const h3 = defaultDashboard({ headingLevel: 3, dashboardPath: "Home.md" });
    expect(h3).toContain("### 最近修改");
    expect(parseDashboard(h3, 3)).toHaveLength(2);
    // 反过来：用 H2 去解析这份 H3 内容，应当是空的
    expect(parseDashboard(h3, 2)).toHaveLength(0);
  });

  it("makes both cards wide, which is what the two-column default is for", () => {
    // 两张宽卡片在 2 列网格里各占满一行；漏掉 span 就会变成两张窄卡、左边空一列
    for (const meta of parseDashboard(dashboard, LEVEL).map((s) => s.meta)) {
      expect(meta.span).toBe(2);
    }
  });

  it("leaves the column unassigned, so the round-robin fallback can place them", () => {
    // 不写 col → 第 1 张落列 1、第 2 张落列 2。写死反而会在用户改列数后错位
    for (const meta of parseDashboard(dashboard, LEVEL).map((s) => s.meta)) {
      expect(meta.col).toBe(DEFAULT_CARD_META.col);
    }
  });

  it("puts an inline base block in each card", () => {
    for (const body of bodiesOf(dashboard)) {
      expect(body).toContain("```base");
    }
  });

  /**
   * 排序必须用 `sort`，**不能**用 `order`。
   *
   * Bases 的视图 schema 里 `order` 只决定列的先后顺序，`sort` 才是排序（解析器里是
   * `{property, direction}` 两组字段）。写错不报错，只是这张卡永远不排序——看起来就是
   * 「插件建的默认页不对」，却查不出原因。
   */
  it("sorts with sort, not with order", () => {
    const yaml = baseYaml(bodiesOf(dashboard)[0]!);
    expect(yaml).toMatch(/^\s*sort:\s*$/m);
    expect(yaml).toMatch(/-\s*property:\s*file\.mtime\s*\n\s*direction:\s*DESC/);
    // order 只管列顺序，两张卡都应当照样列出它
    expect(yaml).toMatch(/^\s*order:\s*$/m);
  });

  it("sorts the two cards by mtime and ctime respectively", () => {
    const [modified, created] = bodiesOf(dashboard).map((body) => baseYaml(body));
    expect(modified).toContain("file.mtime");
    expect(modified).not.toContain("file.ctime");
    expect(created).toContain("file.ctime");
    expect(created).not.toContain("file.mtime");
  });

  it("caps the rows, so a card cannot grow without bound", () => {
    for (const body of bodiesOf(dashboard)) {
      expect(baseYaml(body)).toMatch(/^\s*limit:\s*[1-9]/m);
    }
  });

  /**
   * 仪表盘自己必须被排除：它是插件唯一会写的文件，不排除的话它永远排在「最近修改」第一位，
   * 而每次拖拽卡片都会让它更"新"，这张卡就成了自证循环的噪声。
   */
  it("excludes the dashboard note itself from both views", () => {
    for (const body of bodiesOf(dashboard)) {
      const yaml = baseYaml(body);
      expect(yaml).toContain("file.path !=");
      expect(yaml).toContain("Home.md");
    }
  });

  /**
   * 路径要按 YAML 双引号标量的规则转义。
   *
   * 手写成 `"${path}"` 的话，含引号或反斜杠的路径（Windows 上很常见）会产出非法 YAML，
   * 而 Bases 解析失败不报错——整张卡空着，看不出是路径的问题。
   */
  it("quotes the path so odd characters cannot break the YAML", () => {
    const tricky = defaultDashboard({
      headingLevel: LEVEL,
      dashboardPath: 'My "Home".md',
    });
    expect(tricky).toContain('file.path != "My \\"Home\\".md"');
  });
});
