/**
 * 内容样式特性的注册表。
 *
 * 这些特性都是「开/关」而不是「选一种样式」：它们各自独立，可以任意组合，所以每个都是布尔值。
 *
 * 这张表是单一事实来源，同时驱动三处：
 *   - `settings.ts`：`ContentStyleKey` 由它推导，`CardHomeTabSettings` 因此必须包含全部键，
 *     `DEFAULT_SETTINGS` 漏一个就编译不过；`mergeSettings` 遍历它读取，不必逐字段手写。
 *   - `settings-tab.ts`：按 group 渲染折叠块，按 feature 渲染开关。
 *   - `home-view.ts`：按 feature 往首页根节点上开闸类。
 *
 * 新增一个特性 = 在这里加一条 + 在 styles.css 里写对应规则。`tests/content-styles.test.ts`
 * 会校验每个 className 都真的在 styles.css 里出现过，避免注册了却没样式的空开关。
 *
 * `as const` 不能去掉：`ContentStyleKey` 是从这张表的字面量推导出来的，去掉之后 key 会退化成
 * string，设置对象就不再受类型约束，漏写或拼错都要等到运行时才发现。
 */
export const CONTENT_STYLE_GROUPS = [
  {
    id: "table",
    name: "表格",
    description: "卡片内 Markdown 表格的呈现。",
    features: [
      {
        key: "tableZebra",
        className: "is-table-zebra",
        name: "斑马条纹",
        description: "数据行深浅背景交替。表头不参与，悬停反馈保留。",
      },
    ],
  },
  {
    id: "base",
    name: "Base",
    description: "卡片内 base 视图的呈现。",
    features: [
      {
        key: "baseBar",
        className: "is-base-bar",
        name: "长条 base 表格",
        description:
          "把表格视图的每一行画成一块整宽圆角色块，行间留间距、去掉行列分隔线。" +
          "单元格仍横向并排在一行内：base 表格是虚拟滚动，行与单元格的位置由 JS 算出，" +
          "所以这里只做绘制、不改布局。",
      },
      {
        key: "baseHideToolbar",
        className: "is-base-toolbar-hidden",
        name: "隐藏顶部工具栏",
        description: "隐藏顶部那一行控件（视图选择、结果数、排序、筛选、属性），只留内容。",
      },
    ],
  },
] as const;

/** 全部内容样式特性的设置键，由注册表推导，不会与之脱节 */
export type ContentStyleKey =
  (typeof CONTENT_STYLE_GROUPS)[number]["features"][number]["key"];

/** 设置对象里内容样式那一段的形状 */
export type ContentStyleSettings = Record<ContentStyleKey, boolean>;

/** 展平成一维，供需要逐个特性处理的地方使用（开闸类、测试） */
export function contentStyleFeatures(): { key: ContentStyleKey; className: string }[] {
  return CONTENT_STYLE_GROUPS.flatMap((group) =>
    group.features.map((feature) => ({ key: feature.key, className: feature.className })),
  );
}
