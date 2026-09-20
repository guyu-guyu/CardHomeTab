export interface RecentFile {
  path: string;
  timestamp: number;
}

export interface CardHomeTabSettings {
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

function pickNumber(
  raw: RawRecord,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
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

export function mergeSettings(raw: unknown): CardHomeTabSettings {
  const record = asRecord(raw);
  if (!record) {
    return { ...DEFAULT_SETTINGS };
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
    logoScale: pickNumber(record, "logoScale", DEFAULT_SETTINGS.logoScale, 0.2, 5),
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
    recentFiles: parseRecentFiles(record["recentFiles"]),
  };
}
