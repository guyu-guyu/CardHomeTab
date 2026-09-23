import {
  contentStyleFeatureList,
  optionValues,
  type ContentStyleKey,
  type ContentStyleSettings,
} from "./content-styles";

export interface RecentFile {
  path: string;
  timestamp: number;
}

/** 继承 ContentStyleSettings：注册表里加了特性而这里忘了给默认值，会在编译期报错 */
export interface CardHomeTabSettings extends ContentStyleSettings {
  version: number;
  dashboardFile: string;
  cardHeadingLevel: number;
  replaceNewTabs: boolean;
  openOnStartup: boolean;
  logoType: "none" | "lucide" | "vaultImage" | "url";
  logoValue: string;
  logoScale: number;
  logoColor: string;
  wordmark: string;
  showWordmark: boolean;
  fontSize: string;
  fontWeight: number;
  backgroundType: "none" | "vaultImage" | "url";
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
  recentFiles: RecentFile[];
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: CardHomeTabSettings = {
  version: SETTINGS_VERSION,
  dashboardFile: "Home.md",
  cardHeadingLevel: 2,
  replaceNewTabs: true,
  openOnStartup: false,
  logoType: "lucide",
  logoValue: "lucide-home",
  logoScale: 1.2,
  logoColor: "",
  wordmark: "",
  showWordmark: true,
  fontSize: "4em",
  fontWeight: 600,
  backgroundType: "none",
  backgroundLight: "",
  backgroundDark: "",
  backgroundBlur: 0,
  backgroundDim: 0,
  showSearch: true,
  maxResults: 5,
  markdownOnly: true,
  showPath: true,
  showBookmarks: true,
  showRecentFiles: true,
  maxRecentFiles: 5,
  gridColumns: 3,
  // 卡片外观的默认值必须**等于插件此前写死的样子**，升级后观感零变化。
  // 这些数字与 styles.css 里 `var(--home-tab-card-*, 兜底)` 的兜底值一一对应，
  // 两边漂移会让「默认值」与「实际默认外观」对不上；tests/content-styles.test.ts 钉住了这层对应。
  cardTitle: true,
  cardRadius: 8,
  cardGap: 16,
  cardBorderStyle: "solid",
  cardBorderWidth: 1,
  cardShadow: "none",
  // 内容样式默认关闭：它们改变的是用户笔记的观感，不该在升级后凭空生效
  tableZebra: false,
  baseBar: false,
  baseHideToolbar: false,
  recentFiles: [],
};

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as RawRecord;
}

function pickString(raw: RawRecord, key: string, fallback: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : fallback;
}

function pickBoolean(raw: RawRecord, key: string, fallback: boolean): boolean {
  const value = raw[key];
  return typeof value === "boolean" ? value : fallback;
}

type Rounder = (value: number) => number;

/** 用于 slider 步长小于 1 的字段（如 logoScale 的 0.1 步长），保留一位小数 */
const roundToOneDecimal: Rounder = (value) => Math.round(value * 10) / 10;

/** 数值字段的统一入口；round 默认取整，因为整数字段（fontWeight、gridColumns 等）占多数 */
function pickNumber(
  raw: RawRecord,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
  round: Rounder = Math.round,
): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, round(value)));
}

function pickUnion<T extends string>(
  raw: RawRecord,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** 标题级别不做钳制：2..6 之外的整数一律回落默认值，因为它不是"可修复"的数值 */
function pickHeadingLevel(raw: RawRecord): number {
  const value = raw["cardHeadingLevel"];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2 || value > 6) {
    return DEFAULT_SETTINGS.cardHeadingLevel;
  }
  return value;
}

function parseRecentFiles(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: RecentFile[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const path = record["path"];
    const timestamp = record["timestamp"];
    if (typeof path === "string" && path.length > 0 && typeof timestamp === "number") {
      result.push({ path, timestamp });
    }
  }
  return result;
}

/**
 * 读取内容样式那一段。遍历注册表而不是逐字段手写，所以注册表里加一条就自动被读取，
 * 不会出现「设置界面有开关、但 mergeSettings 忘了读、重启后失效」这种不对称。
 *
 * 末尾的 cast 与从前的 `{} as` 同级：下面的循环覆盖了每一个键。但多类型之后多了一个风险——
 * 若将来加了新的 `kind` 而这里漏写分支，那个键会被写成 `undefined` 且没人报错。switch 末尾
 * 的 `never` 断言就是为此：漏一个 kind 编译不过。
 */
function mergeContentStyles(record: RawRecord): ContentStyleSettings {
  const result: Record<string, boolean | number | string> = {};
  for (const feature of contentStyleFeatureList()) {
    const key = feature.key;
    switch (feature.kind) {
      case "toggle": {
        result[key] = pickBoolean(record, key, DEFAULT_SETTINGS[key] === true);
        break;
      }
      case "number": {
        const fallback = DEFAULT_SETTINGS[key];
        result[key] = pickNumber(
          record,
          key,
          typeof fallback === "number" ? fallback : feature.min,
          feature.min,
          feature.max,
        );
        break;
      }
      case "enum": {
        result[key] = pickUnion(
          record,
          key,
          optionValues(feature.options),
          String(DEFAULT_SETTINGS[key]),
        );
        break;
      }
      default: {
        const exhaustive: never = feature;
        throw new Error(`未处理的内容样式类型：${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return result as unknown as ContentStyleSettings;
}

/**
 * 往设置对象里写一个内容样式的值。
 *
 * 这里必须有一次断言，而且这是全仓唯一一处：`settings[key] = value` 中 `key` 是键的**联合**，
 * TS 要求值可赋给所有候选属性类型的**交集**。toggle-only 的交集是 `boolean`、number-only 是
 * `number`，都还能写；但两个枚举键的字面量联合交集是 `never`，于是任何值都赋不进去。
 *
 * 运行时安全由三层兜住：设置页的下拉只会发出 option 里声明过的值、`pickUnion` 在读取时校验、
 * 以及 `tests/content-styles.test.ts` 的 round-trip 守卫。
 */
export function writeContentStyle(
  settings: CardHomeTabSettings,
  key: ContentStyleKey,
  value: boolean | number | string,
): void {
  (settings as unknown as Record<string, unknown>)[key] = value;
}

/**
 * 值是标量的设置键。
 *
 * 「是否改过」与「重置」都只对这些键成立：`recentFiles` 是数组（运行时数据，不是用户设置），
 * 逐个比较它没有意义，所以在类型层就把它排除掉——传进去会编译不过。
 */
export type ScalarSettingKey = {
  [K in keyof CardHomeTabSettings]: CardHomeTabSettings[K] extends boolean | number | string
    ? K
    : never;
}[keyof CardHomeTabSettings];

/**
 * 设置页上手写的那几节各自管哪些键。
 *
 * 之所以要显式列出：重置按钮得知道"这一块包含什么"，而这些控件是一条条手写的，代码里没有
 * 任何地方能反推出归属。内容样式那几组不在这里——它们的键由 `CONTENT_STYLE_GROUPS` 推导。
 *
 * `tests/settings.test.ts` 有一条完备性守卫：这里 + 注册表 + 两个非设置项，必须正好等于
 * `CardHomeTabSettings` 的全部键。所以新增一个设置项时忘了归类，测试会红——否则那个设置
 * 永远不参与重置，而且没人会发现。
 */
export const SETTING_SECTION_KEYS = {
  /** 「页面」不是折叠块（没有重置按钮），列出来只为让完备性守卫成立 */
  page: ["dashboardFile", "cardHeadingLevel", "gridColumns", "replaceNewTabs", "openOnStartup"],
  brand: [
    "logoType",
    "logoValue",
    "logoScale",
    "logoColor",
    "wordmark",
    "showWordmark",
    "fontSize",
    "fontWeight",
  ],
  background: [
    "backgroundType",
    "backgroundLight",
    "backgroundDark",
    "backgroundBlur",
    "backgroundDim",
  ],
  search: [
    "showSearch",
    "markdownOnly",
    "showPath",
    "showBookmarks",
    "showRecentFiles",
    "maxResults",
    "maxRecentFiles",
  ],
} as const satisfies Record<string, readonly ScalarSettingKey[]>;

/** 不属于任何分区的键：`version` 是内部字段，`recentFiles` 是运行时数据 */
export const NON_SECTION_KEYS = ["version", "recentFiles"] as const;

/** 这些键里有任何一个不等于默认值 */
export function hasChangedFromDefault(
  settings: CardHomeTabSettings,
  keys: readonly ScalarSettingKey[],
): boolean {
  return keys.some((key) => settings[key] !== DEFAULT_SETTINGS[key]);
}

/**
 * 把这些键恢复成默认值。
 *
 * 与 `writeContentStyle` 同样的理由需要一次断言：`keys` 是键的联合，逐个赋值时 TS 要求值
 * 能赋给所有候选属性类型的交集，而那个交集通常是 `never`。
 */
export function resetToDefault(
  settings: CardHomeTabSettings,
  keys: readonly ScalarSettingKey[],
): void {
  const target = settings as unknown as Record<string, unknown>;
  for (const key of keys) {
    target[key] = DEFAULT_SETTINGS[key];
  }
}

export function mergeSettings(raw: unknown): CardHomeTabSettings {
  const record = asRecord(raw);
  if (!record) {
    return { ...DEFAULT_SETTINGS, recentFiles: [] };
  }
  return {
    version: SETTINGS_VERSION,
    dashboardFile: pickString(record, "dashboardFile", DEFAULT_SETTINGS.dashboardFile),
    cardHeadingLevel: pickHeadingLevel(record),
    replaceNewTabs: pickBoolean(record, "replaceNewTabs", DEFAULT_SETTINGS.replaceNewTabs),
    openOnStartup: pickBoolean(record, "openOnStartup", DEFAULT_SETTINGS.openOnStartup),
    logoType: pickUnion(
      record,
      "logoType",
      ["none", "lucide", "vaultImage", "url"] as const,
      DEFAULT_SETTINGS.logoType,
    ),
    logoValue: pickString(record, "logoValue", DEFAULT_SETTINGS.logoValue),
    logoScale: pickNumber(
      record,
      "logoScale",
      DEFAULT_SETTINGS.logoScale,
      0.2,
      5,
      roundToOneDecimal,
    ),
    logoColor: pickString(record, "logoColor", DEFAULT_SETTINGS.logoColor),
    wordmark: pickString(record, "wordmark", DEFAULT_SETTINGS.wordmark),
    showWordmark: pickBoolean(record, "showWordmark", DEFAULT_SETTINGS.showWordmark),
    fontSize: pickString(record, "fontSize", DEFAULT_SETTINGS.fontSize),
    fontWeight: pickNumber(record, "fontWeight", DEFAULT_SETTINGS.fontWeight, 100, 900),
    backgroundType: pickUnion(
      record,
      "backgroundType",
      ["none", "vaultImage", "url"] as const,
      DEFAULT_SETTINGS.backgroundType,
    ),
    backgroundLight: pickString(record, "backgroundLight", DEFAULT_SETTINGS.backgroundLight),
    backgroundDark: pickString(record, "backgroundDark", DEFAULT_SETTINGS.backgroundDark),
    backgroundBlur: pickNumber(record, "backgroundBlur", DEFAULT_SETTINGS.backgroundBlur, 0, 40),
    backgroundDim: pickNumber(record, "backgroundDim", DEFAULT_SETTINGS.backgroundDim, 0, 100),
    showSearch: pickBoolean(record, "showSearch", DEFAULT_SETTINGS.showSearch),
    maxResults: pickNumber(record, "maxResults", DEFAULT_SETTINGS.maxResults, 1, 50),
    markdownOnly: pickBoolean(record, "markdownOnly", DEFAULT_SETTINGS.markdownOnly),
    showPath: pickBoolean(record, "showPath", DEFAULT_SETTINGS.showPath),
    showBookmarks: pickBoolean(record, "showBookmarks", DEFAULT_SETTINGS.showBookmarks),
    showRecentFiles: pickBoolean(record, "showRecentFiles", DEFAULT_SETTINGS.showRecentFiles),
    maxRecentFiles: pickNumber(record, "maxRecentFiles", DEFAULT_SETTINGS.maxRecentFiles, 0, 20),
    gridColumns: pickNumber(record, "gridColumns", DEFAULT_SETTINGS.gridColumns, 1, 6),
    ...mergeContentStyles(record),
    recentFiles: parseRecentFiles(record["recentFiles"]),
  };
}
