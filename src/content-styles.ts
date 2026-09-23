/**
 * 卡片外观与内容样式的注册表。
 *
 * 这张表是单一事实来源，同时驱动三处：
 *   - `settings.ts`：`ContentStyleKey` 与每个键的**值类型**由它推导，`CardHomeTabSettings`
 *     因此必须包含全部键，`DEFAULT_SETTINGS` 漏一个就编译不过；`mergeContentStyles`
 *     按 `kind` 分派读取，不必逐字段手写。
 *   - `settings-tab.ts`：按 group 渲染折叠块，按 `kind` 渲染开关 / 滑块 / 下拉。
 *   - `home-view.ts`：`contentStyleGates` 产出开闸类、`contentStyleVariables` 产出 CSS 变量，
 *     两者都写在首页根节点上。
 *
 * 新增一个特性 = 在这里加一条 + 在 styles.css 里写对应规则。`tests/content-styles.test.ts`
 * 与 `tests/styles.test.ts` 会校验每个类名与变量都真的在 styles.css 里出现过，避免注册了
 * 却没样式的空开关。
 */

interface FeatureBase {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

/** 布尔开关，落成一个开闸类 */
interface ToggleFeature extends FeatureBase {
  readonly kind: "toggle";
  readonly className: string;
  /**
   * 默认外观即「开」的开关：类只在值为 **false** 时挂上。
   *
   * 「显示卡片标题」默认是开的，如果按常规写成 `is-card-title` 在 true 时挂类，那么默认
   * 状态下就带着一个什么都不做的类，而真正要写 CSS 的是「隐藏」那一侧。反过来声明
   * `is-card-title-hidden` + `invert`，默认态不挂任何类，CSS 也只需写隐藏态。
   */
  readonly invert?: true;
}

/** 数值，落成一个 CSS 变量（单位在 JS 侧拼好） */
interface NumberFeature extends FeatureBase {
  readonly kind: "number";
  readonly variable: `--home-tab-${string}`;
  readonly unit: "px";
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

interface EnumOption {
  readonly value: string;
  readonly label: string;
  /** 走开闸类的枚举项才给；默认值那一项通常不给类（= 什么都不做） */
  readonly className?: string;
}

/**
 * 枚举。两种落地方式：
 *   - 给 `variable` → 值直接写进 CSS 变量（如 border-style 的 solid/dashed）。
 *   - 不给 `variable` → 每个 option 自带 `className`，值拼类名（如投影的 hover 态需要独立
 *     选择器，没法用单个变量值表达）。
 */
interface EnumFeature extends FeatureBase {
  readonly kind: "enum";
  readonly options: readonly [EnumOption, ...EnumOption[]];
  readonly variable?: `--home-tab-${string}`;
}

type AnyFeature = ToggleFeature | NumberFeature | EnumFeature;

interface StyleGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly features: readonly [AnyFeature, ...AnyFeature[]];
}

/**
 * `as const` 不能去掉：键与枚举值的字面量类型都是从这张表推导出来的，去掉之后会退化成
 * `string`，设置对象就不再受类型约束，漏写或拼错都要等到运行时才发现。
 * `satisfies` 负责结构校验（字段名写错、kind 与必填字段不匹配都会在这里报错）。
 */
export const CONTENT_STYLE_GROUPS = [
  {
    id: "card",
    name: "卡片",
    description: "卡片本身的外观。",
    features: [
      {
        kind: "toggle",
        key: "cardTitle",
        // 默认是开的，所以类名取「隐藏」那一侧 + invert：默认态不挂任何类，CSS 也只需写隐藏态
        className: "is-card-title-hidden",
        invert: true,
        name: "显示卡片标题",
        description:
          "关掉后标题与图标都不显示，卡片内容顶到最上面。" +
          "拖拽手柄与设置、编辑、删除按钮会浮到卡片右上角，悬停时出现。",
      },
      {
        kind: "number",
        key: "cardRadius",
        variable: "--home-tab-card-radius",
        unit: "px",
        min: 0,
        max: 24,
        step: 1,
        name: "圆角半径",
        description: "默认 8，与 Obsidian 的 --radius-m 一致。",
      },
      {
        kind: "number",
        key: "cardGap",
        variable: "--home-tab-card-gap",
        unit: "px",
        min: 0,
        max: 48,
        step: 1,
        name: "卡片间距",
        description: "横向与竖向同时生效。默认 16。",
      },
      {
        kind: "enum",
        key: "cardBorderStyle",
        variable: "--home-tab-card-border-style",
        options: [
          { value: "none", label: "无" },
          { value: "solid", label: "实线" },
          { value: "dashed", label: "虚线" },
          { value: "dotted", label: "点线" },
        ],
        name: "边框样式",
        description: "选「无」等同于把边框粗细调到 0。",
      },
      {
        kind: "number",
        key: "cardBorderWidth",
        variable: "--home-tab-card-border-width",
        unit: "px",
        min: 0,
        max: 8,
        step: 1,
        name: "边框粗细",
        description: "默认 1。",
      },
      {
        kind: "enum",
        key: "cardShadow",
        // 不给 variable：「悬停时显示」需要一条独立的 :hover 选择器，没法用单个变量值表达。
        // 「不显示」是默认值，不给类——不挂任何类就是"什么都不做"。
        options: [
          { value: "none", label: "不显示" },
          { value: "always", label: "一直显示", className: "is-card-shadow-always" },
          { value: "hover", label: "鼠标悬停时显示", className: "is-card-shadow-hover" },
        ],
        name: "投影",
        description: "投影强度取自主题的 --shadow-s，可用 --home-tab-card-shadow 覆盖。",
      },
    ],
  },
  {
    id: "table",
    name: "表格",
    description: "卡片内 Markdown 表格的呈现。",
    features: [
      {
        kind: "toggle",
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
        kind: "toggle",
        key: "baseBar",
        className: "is-base-bar",
        name: "长条 base 表格",
        description:
          "把表格视图的每一行画成一块整宽圆角色块，行间留间距、去掉行列分隔线。" +
          "单元格仍横向并排在一行内：base 表格是虚拟滚动，行与单元格的位置由 JS 算出，" +
          "所以这里只做绘制、不改布局。",
      },
      {
        kind: "toggle",
        key: "baseHideToolbar",
        className: "is-base-toolbar-hidden",
        name: "隐藏顶部工具栏",
        description: "隐藏顶部那一行控件（视图选择、结果数、排序、筛选、属性），只留内容。",
      },
    ],
  },
] as const satisfies readonly StyleGroup[];

type Feature = (typeof CONTENT_STYLE_GROUPS)[number]["features"][number];

/** 全部特性的设置键，由注册表推导，不会与之脱节 */
export type ContentStyleKey = Feature["key"];

/**
 * 一条特性对应的值类型。
 *
 * 枚举那一支必须用 `infer` 取值：条件类型的真分支**不会**收窄类型参数，直接写
 * `F extends { kind: "enum" } ? F["options"][number]["value"]` 会报「属性不存在」。
 */
type ValueOf<F> = F extends { kind: "toggle" }
  ? boolean
  : F extends { kind: "number" }
    ? number
    : F extends { kind: "enum"; options: readonly { value: infer V extends string }[] }
      ? V
      : never;

/**
 * 设置对象里这一段的形状：键来自注册表，值类型按 `kind` 映射。
 *
 * 写成「映射键 + `Extract` 反查成员」而不是 `{ [F in Feature as F["key"]]: … }`——后者的
 * `in` 域必须是键类型，对一个对象联合做映射是非法的。
 */
export type ContentStyleSettings = {
  [K in ContentStyleKey]: ValueOf<Extract<Feature, { key: K }>>;
};

/**
 * 遍历用的特性类型：字段取**宽**的 `AnyFeature`，只把 `key` 收窄到注册表里真实存在的键。
 *
 * 不直接用上面从 `as const` 推导出的 `Feature`：那个类型精确到「表里当前恰好有哪些 kind」，
 * 于是哪天表里最后一条 number 特性被删掉，所有读 `feature.variable` 的 helper 会突然编译
 * 不过——而它们本该是对 kind 的完整分派。宽类型让 helper 只依赖「注册表**可能**有什么」。
 */
type WideFeature = AnyFeature & { readonly key: ContentStyleKey };

/**
 * 把 `feature.options` 拓宽成一个普通数组再用。
 *
 * 不能直接对它 `.map()` 或 for-of：两个枚举特性的 `options` 是**不同的元组类型**，联合起来
 * 之后 TS 会报「union has signatures but none compatible」。经过这个拓宽形参的函数之后，
 * 类型统一成 `readonly EnumOption[]`，调用方就正常了。
 */
export function enumOptions(options: readonly EnumOption[]): readonly EnumOption[] {
  return options;
}

/** 枚举的全部合法值，供 `mergeSettings` 校验用 */
export function optionValues(options: readonly EnumOption[]): readonly string[] {
  return options.map((option) => option.value);
}

/** 同 `enumOptions` 的理由：group 的 `features` 也是元组联合，直接展开会撞同一个错误 */
function widen(features: readonly AnyFeature[]): readonly WideFeature[] {
  return features as readonly WideFeature[];
}

/** 展平成一维，供需要逐个特性处理的地方使用（读写设置、设置页渲染、测试） */
export function contentStyleFeatureList(): readonly WideFeature[] {
  return CONTENT_STYLE_GROUPS.flatMap((group) => widen(group.features));
}

/** 一个 group 的特性列表，字段已拓宽（设置页按 group 渲染时用） */
export function groupFeatures(group: (typeof CONTENT_STYLE_GROUPS)[number]): readonly WideFeature[] {
  return widen(group.features);
}

/**
 * 每个开闸类当前该不该挂。
 *
 * 枚举把**每个**候选类都产出一条（而不是只产出当前选中的那个），这样调用方一律
 * `toggleClass(className, on)` 就够了：同组其它值必然收到 `false`、被摘掉。不这样做的话
 * 切换枚举时得自己记住上一个值去清理，而设置页重建后那个「上一个值」已经没了。
 */
export function contentStyleGates(
  settings: ContentStyleSettings,
): { className: string; on: boolean }[] {
  const gates: { className: string; on: boolean }[] = [];
  for (const feature of contentStyleFeatureList()) {
    if (feature.kind === "toggle") {
      const value = settings[feature.key] === true;
      gates.push({ className: feature.className, on: feature.invert === true ? !value : value });
      continue;
    }
    if (feature.kind === "enum" && feature.variable === undefined) {
      for (const option of enumOptions(feature.options)) {
        if (option.className !== undefined) {
          gates.push({ className: option.className, on: settings[feature.key] === option.value });
        }
      }
    }
  }
  return gates;
}

/** 注册表声明过的全部开闸类名（含枚举的每个候选），供守卫测试用 */
export function contentStyleGateClasses(): string[] {
  const names: string[] = [];
  for (const feature of contentStyleFeatureList()) {
    if (feature.kind === "toggle") {
      names.push(feature.className);
      continue;
    }
    if (feature.kind === "enum" && feature.variable === undefined) {
      for (const option of enumOptions(feature.options)) {
        if (option.className !== undefined) {
          names.push(option.className);
        }
      }
    }
  }
  return names;
}

/**
 * 要写到首页根节点上的 CSS 变量。
 *
 * 单位在这里拼好（`8` → `"8px"`），不留给 CSS 去 `calc(var(x) * 1px)`：后者要求变量值是无
 * 单位数，那样 styles.css 里的兜底就写不成 `var(--home-tab-card-radius, var(--radius-m))`
 * 了——`--radius-m` 本身带 px。
 */
export function contentStyleVariables(
  settings: ContentStyleSettings,
): { name: string; value: string }[] {
  const variables: { name: string; value: string }[] = [];
  for (const feature of contentStyleFeatureList()) {
    if (feature.kind === "number") {
      variables.push({
        name: feature.variable,
        value: `${String(settings[feature.key])}${feature.unit}`,
      });
      continue;
    }
    if (feature.kind === "enum" && feature.variable !== undefined) {
      variables.push({ name: feature.variable, value: String(settings[feature.key]) });
    }
  }
  return variables;
}

/** 注册表声明过的全部 CSS 变量名，供守卫测试用 */
export function contentStyleVariableNames(): string[] {
  const names: string[] = [];
  for (const feature of contentStyleFeatureList()) {
    if (feature.kind === "number") {
      names.push(feature.variable);
    } else if (feature.kind === "enum" && feature.variable !== undefined) {
      names.push(feature.variable);
    }
  }
  return names;
}
