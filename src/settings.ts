import {
  CONTENT_STYLE_GROUPS,
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
  // 内容样式一律默认关闭：它们改变的是用户笔记的观感，不该在升级后凭空生效
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
 * `{} as` 这个断言是安全的：下面的循环覆盖了 ContentStyleKey 的每一个键。
 */
function mergeContentStyles(record: RawRecord): ContentStyleSettings {
  const result = {} as ContentStyleSettings;
  for (const group of CONTENT_STYLE_GROUPS) {
    for (const feature of group.features) {
      const key: ContentStyleKey = feature.key;
      result[key] = pickBoolean(record, key, DEFAULT_SETTINGS[key]);
    }
  }
  return result;
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
