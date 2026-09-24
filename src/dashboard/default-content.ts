/**
 * 新标签页首次打开、而仪表盘文件还不存在时，自动创建出来的默认内容。
 *
 * 两张卡都是内联 base 块、都以「宽卡片」形式（`span=2`）铺满整行：
 *   - 最近修改：`file.mtime` 倒序
 *   - 最近创建：`file.ctime` 倒序
 *
 * 依据都是从**运行版本的 app.asar** 里核实出来的，不是照抄设计文档或第三方样式表：
 *
 *   - Bases 的**视图** schema 里排序是 `sort`（`{property, direction: ASC|DESC}`），
 *     **不是** `order`——`order` 只决定列的先后。写错不报错，只是永远不排序。
 *   - `limit` 是正整数，由解析器的 `case "limit"` 读进视图配置。
 *   - `file.*` 只有 backlinks / basename / ctime / embeds / ext / folder / fullname /
 *     links / mtime / name / path / size / tags，**没有书签**（书签在
 *     `.obsidian/bookmarks.json` 里，Bases 读不到），所以「加了书签的文件」做不到。
 *   - 函数表里有 `file` / `inFolder` / `hasTag` / `hasProperty` 等，但同样没有书签相关函数。
 */

export interface DefaultDashboardArgs {
  /** 与设置项 `cardHeadingLevel` 对齐：默认内容必须用**同一级别**的标题，否则切不出卡片 */
  headingLevel: number;
  /** 仪表盘自身路径。两张动态卡都要排除它，否则它自己永远排在第一位 */
  dashboardPath: string;
}

/** 每张卡最多显示多少条。超过之后 base 视图本身会滚动，卡片高度就不再增长了 */
const CARD_LIMIT = 10;

function headingOf(level: number): string {
  const safe = Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
  return "#".repeat(safe);
}

/**
 * YAML 里的双引号标量。
 *
 * 用 `JSON.stringify` 而不是手写 `"${path}"`：路径里可能含引号或反斜杠（Windows 路径常见），
 * 手写的写法会产出非法 YAML，而 Bases 解析失败并不报错——整张卡就空着，看不出原因。
 * 基本转义（\" \\）在 YAML 与 JSON 里一致，这里够用。
 */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

function baseCard(args: {
  heading: string;
  title: string;
  icon: string;
  property: string;
  exclude: string;
}): string[] {
  return [
    `${args.heading} ${args.title}`,
    `%%card: span=2; icon=${args.icon}%%`,
    "```base",
    "filters:",
    "  and:",
    `    - file.path != ${args.exclude}`,
    "views:",
    "  - type: table",
    `    name: ${args.title}`,
    "    order:",
    "      - file.name",
    `      - ${args.property}`,
    // 排序在这里。写成 order 的话列顺序照旧、但永远不排序，而且没有任何提示
    "    sort:",
    `      - property: ${args.property}`,
    "        direction: DESC",
    `    limit: ${String(CARD_LIMIT)}`,
    "```",
    "",
  ];
}

export function defaultDashboard(args: DefaultDashboardArgs): string {
  const heading = headingOf(args.headingLevel);
  const exclude = yamlString(args.dashboardPath);
  return [
    ...baseCard({
      heading,
      title: "最近修改",
      icon: "lucide-calendar-days",
      property: "file.mtime",
      exclude,
    }),
    ...baseCard({
      heading,
      title: "最近创建",
      icon: "lucide-file-plus",
      property: "file.ctime",
      exclude,
    }),
  ].join("\n");
}
