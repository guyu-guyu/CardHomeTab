# CardHomeTab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Obsidian 启动页插件 CardHomeTab：自定义 logo、搜索框、自定义背景图，以及核心的自定义卡片——卡片内容取自单一仪表盘笔记、按标题切分，支持 Obsidian 全部内容类型，每张卡片可引用不同的 CSS 片段。

**Architecture:** 三层。纯函数层（`dashboard/metadata.ts`、`dashboard/parse.ts`、`dashboard/edit.ts`、`auto-snippets.ts`、`snippet-scope.ts`、`settings.ts`）不依赖 Obsidian，用 vitest 驱动。IO 层（`dashboard/io.ts`、`snippets.ts`）封装全部 Vault 访问，文件写入只走 `vault.process` 且只替换目标 section 的字符区间。视图层（`home-view.ts`、`card.ts`、`card-grid.ts` 等）只管 DOM 与交互，每张卡片用独立 `Component` 驱动 `MarkdownRenderer.render`。

**Tech Stack:** TypeScript（strict + noUncheckedIndexedAccess）、esbuild（cjs 打包到 `dist/`）、vitest、eslint + eslint-plugin-obsidianmd、Obsidian 公开 API。

## Global Constraints

以下约束适用于**每一个**任务，不再逐条重复：

- 插件 id `card-home-tab`，name `CardHomeTab`，author `guyu-guyu`，`minAppVersion` `1.9.0`，`isDesktopOnly` false。
- **只用公开 API。** 禁止 `new WorkspaceLeaf(...)`、禁止访问 `app.internalPlugins`、禁止在 `onunload` 里 `detach()` leaf。
- **DOM 一律用 Obsidian 的全局 helper**：`createEl` / `createDiv` / `createSpan`，以及元素上的 `el.createEl` / `el.createDiv` / `el.createSpan`。**禁止**写成 `document.createElement` / `document.createDiv` 之类——这类误用在既有项目里导致过线上 bug。清空容器优先用 `el.empty()`。
- **CSS 片段只通过 `@scope` 作用域注入**，禁止调用 `app.customCss.setCssEnabledStatus`，禁止修改 `appearance.json` 的 `enabledCssSnippets`。
- **仪表盘文件写入只走 `vault.process`**，且只替换目标 section 的字符区间；禁止把文件整体解析成对象再重新序列化。
- 卡片内容容器必须带上 `markdown-rendered` 类，否则主题排版与 bases / dataview 的 CSS 变量都不生效。
- TypeScript 编译选项：`strict`、`noUncheckedIndexedAccess`、`noImplicitAny`、`target` ES2022、`module` ESNext、`moduleResolution` Bundler、`noEmit`。
- 测试文件放 `tests/`，一律 `import { describe, expect, it } from "vitest"` 显式导入（不开 `globals`）。
- 提交信息用约定式前缀 + 中文描述（`feat:` / `fix:` / `chore:` / `docs:` / `test:`）。
- **面向用户的 UI 文案一律用中文**，与既有 `annote_sidebar` 保持一致（它的 `getDisplayText()` 返回 `"批注"`，命令与设置项也都是中文）。这不只是风格：`eslint-plugin-obsidianmd` 的 `obsidianmd/ui/sentence-case` 会把 `"CardHomeTab"` 这类英文专有名词判为违反句首大写规则，而该规则**不允许用 `eslint-disable` 关掉**（`eslint-comments/no-restricted-disable`），配置里也没有合适的豁免方式。中文文案天然不受这条规则约束。视图的 `getDisplayText()` 返回 `"卡片首页"`。
- 分支名 `master`。
- `npm run check` 由 `test` → `lint` → `build` 三段组成，CI 与本地同一条命令。

## File Structure

| 文件 | 职责 | 任务 |
| --- | --- | --- |
| `package.json` `tsconfig.json` `esbuild.config.mjs` `eslint.config.mjs` `manifest.json` `versions.json` `LICENSE` `styles.css` | 工程骨架 | 1 |
| `src/settings.ts` | 设置类型、默认值、纯函数合并与迁移 | 1 |
| `src/css-modules.d.ts` | `.css` 文本导入的环境声明 | 1 |
| `src/dashboard/metadata.ts` | `%%card:%%` 注释的解析与生成 | 2 |
| `src/fences.ts` | 围栏代码块识别（`parse.ts` 与 `auto-snippets.ts` 共用） | 3 |
| `src/dashboard/parse.ts` | 仪表盘文本 → `CardSection[]` | 3 |
| `src/dashboard/edit.ts` | 增 / 删 / 改元数据 / 移动 section，逐字节保真 | 4 |
| `src/auto-snippets.ts` | `css=auto` 按内容类型推断片段 | 5 |
| `src/snippet-scope.ts` | `@scope` 包裹与预处理 | 6 |
| `src/builtin-snippets/*.css` | 五个内置片段源码 | 7 |
| `src/snippets.ts` | 内置 + 用户片段发现与读取 | 7 |
| `vitest.config.ts` | 让 vitest（Vite）把 `.css` 当文本导入 | 7 |
| `src/vault-path.ts` | 库内路径规范化（纯函数，可单测） | 8 |
| `src/dashboard/io.ts` | `vault.process` 原子写入、文件缺失处理 | 8 |
| `src/main.ts` | 插件入口、命令、事件、视图注册 | 9 |
| `src/home-view.ts` | 首页 `ItemView`：骨架与编排 | 9 |
| `src/card.ts` | 单卡片 DOM、Markdown 渲染、操作条 | 10 |
| `src/card-grid.ts` | 网格布局与拖拽排序 | 11 |
| `src/page-header.ts` `src/background.ts` | logo / wordmark / 背景图层 | 12 |
| `src/search-bar.ts` | 搜索框与建议 | 13 |
| `src/card-settings.ts` | 卡片设置弹窗（图标 / 片段 / 跨列数） | 14 |
| `src/settings-tab.ts` | 设置页 | 15 |
| `README.md` `README.zh.md` `CHANGELOG.md` `.github/workflows/*.yml` | 文档与流水线 | 16 |

---

### Task 1: 工程骨架与设置纯函数

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `eslint.config.mjs`, `manifest.json`, `versions.json`, `LICENSE`, `styles.css`
- Create: `src/settings.ts`, `src/css-modules.d.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `RecentFile`、`CardHomeTabSettings`、`SETTINGS_VERSION`、`DEFAULT_SETTINGS`、`mergeSettings(raw: unknown): CardHomeTabSettings`

- [ ] **Step 1: 建立构建与检查骨架**

`package.json`：

```json
{
  "name": "obsidian-card-home-tab",
  "version": "0.1.0",
  "description": "A start page with user-defined cards for Obsidian.",
  "main": "dist/main.js",
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests --max-warnings 0",
    "check": "npm run test && npm run lint && npm run build"
  },
  "keywords": ["obsidian", "home", "dashboard", "cards"],
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22.15.17",
    "esbuild": "^0.28.2",
    "eslint": "^9.39.5",
    "eslint-plugin-obsidianmd": "^0.4.2",
    "obsidian": "^1.13.1",
    "typescript": "^5.8.3",
    "vitest": "^5.0.0"
  }
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "lib": ["DOM", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "strict": true,
    "target": "ES2022",
    "useDefineForClassFields": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`esbuild.config.mjs`（与既有插件一致，额外加 `.css` 文本 loader）：

```js
import esbuild from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const production = process.argv[2] === "production";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDirectory = path.join(projectRoot, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  ["manifest.json", "styles.css"].map((fileName) =>
    copyFile(path.join(projectRoot, fileName), path.join(outputDirectory, fileName)),
  ),
);

const context = await esbuild.context({
  banner: {
    js: "/* CardHomeTab - generated from TypeScript source */",
  },
  bundle: true,
  entryPoints: [path.join(projectRoot, "src/main.ts")],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  loader: {
    ".css": "text",
  },
  logLevel: "info",
  outfile: path.join(outputDirectory, "main.js"),
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2018",
  treeShaking: true,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
```

`eslint.config.mjs`：

```js
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
]);
```

`manifest.json`：

```json
{
  "id": "card-home-tab",
  "name": "CardHomeTab",
  "version": "0.1.0",
  "minAppVersion": "1.9.0",
  "description": "A start page with user-defined cards. Card content lives in a single dashboard note, split by headings, with per-card CSS snippets.",
  "author": "guyu-guyu",
  "isDesktopOnly": false
}
```

`versions.json`：`{ "0.1.0": "1.9.0" }`

`LICENSE`：MIT 全文，版权行 `Copyright (c) 2026 guyu-guyu`。

`styles.css`（占位，Task 10 起逐步填充）：

```css
/* CardHomeTab styles are appended from Task 10 onward. */
```

`src/css-modules.d.ts`：

```ts
declare module "*.css" {
  const content: string;
  export default content;
}
```

- [ ] **Step 2: 写失败的测试**

`tests/settings.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings";

describe("mergeSettings", () => {
  it("returns defaults for undefined input", () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for non-object input", () => {
    expect(mergeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps stored values and fills in missing keys", () => {
    const merged = mergeSettings({ dashboardFile: "Board.md", gridColumns: 4 });
    expect(merged.dashboardFile).toBe("Board.md");
    expect(merged.gridColumns).toBe(4);
    expect(merged.cardHeadingLevel).toBe(DEFAULT_SETTINGS.cardHeadingLevel);
    expect(merged.logoType).toBe(DEFAULT_SETTINGS.logoType);
  });

  it("ignores values of the wrong type instead of trusting them", () => {
    const merged = mergeSettings({ gridColumns: "many", showSearch: 1 });
    expect(merged.gridColumns).toBe(DEFAULT_SETTINGS.gridColumns);
    expect(merged.showSearch).toBe(DEFAULT_SETTINGS.showSearch);
  });

  it("clamps numeric fields into their valid range", () => {
    expect(mergeSettings({ gridColumns: 0 }).gridColumns).toBe(1);
    expect(mergeSettings({ gridColumns: 99 }).gridColumns).toBe(6);
    expect(mergeSettings({ backgroundDim: 500 }).backgroundDim).toBe(100);
    expect(mergeSettings({ backgroundDim: -5 }).backgroundDim).toBe(0);
  });

  it("falls back to the default for an out-of-range heading level", () => {
    expect(mergeSettings({ cardHeadingLevel: 9 }).cardHeadingLevel).toBe(2);
    expect(mergeSettings({ cardHeadingLevel: 1 }).cardHeadingLevel).toBe(2);
    expect(mergeSettings({ cardHeadingLevel: 3.5 }).cardHeadingLevel).toBe(2);
    expect(mergeSettings({ cardHeadingLevel: 4 }).cardHeadingLevel).toBe(4);
  });

  it("drops malformed recent files and keeps well-formed ones", () => {
    const merged = mergeSettings({
      recentFiles: [
        { path: "a.md", timestamp: 1 },
        { path: "b.md" },
        "c.md",
        { path: 3, timestamp: 2 },
      ],
    });
    expect(merged.recentFiles).toEqual([{ path: "a.md", timestamp: 1 }]);
  });

  it("stamps the current settings version", () => {
    expect(mergeSettings({ version: 0 }).version).toBe(DEFAULT_SETTINGS.version);
  });

  it("keeps fractional values for settings that are not integers", () => {
    expect(mergeSettings({ logoScale: 1.2 }).logoScale).toBe(1.2);
    expect(mergeSettings({ logoScale: 0.25 }).logoScale).toBe(0.3);
    expect(mergeSettings({ logoScale: 9 }).logoScale).toBe(5);
    expect(mergeSettings({ logoScale: 0 }).logoScale).toBe(0.2);
  });

  it("does not alias the shared defaults array", () => {
    const merged = mergeSettings(undefined);
    expect(merged.recentFiles).not.toBe(DEFAULT_SETTINGS.recentFiles);
    merged.recentFiles.push({ path: "leak.md", timestamp: 1 });
    expect(DEFAULT_SETTINGS.recentFiles).toHaveLength(0);
  });

  it("rejects an unknown string for a union field", () => {
    expect(mergeSettings({ logoType: "bogus" }).logoType).toBe(DEFAULT_SETTINGS.logoType);
    expect(mergeSettings({ backgroundType: "bogus" }).backgroundType).toBe(
      DEFAULT_SETTINGS.backgroundType,
    );
  });

  it("rejects a wrong-typed string field", () => {
    expect(mergeSettings({ dashboardFile: 42 }).dashboardFile).toBe(DEFAULT_SETTINGS.dashboardFile);
  });

  it("rejects a non-finite number", () => {
    expect(mergeSettings({ logoScale: Number.POSITIVE_INFINITY }).logoScale).toBe(
      DEFAULT_SETTINGS.logoScale,
    );
    expect(mergeSettings({ logoScale: Number.NaN }).logoScale).toBe(DEFAULT_SETTINGS.logoScale);
  });

  it("rejects a non-array recent files value", () => {
    expect(mergeSettings({ recentFiles: "x" }).recentFiles).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm install && npx vitest run tests/settings.test.ts`
Expected: FAIL — `Failed to resolve import "../src/settings"`。

- [ ] **Step 4: 写实现**

`src/settings.ts`：

```ts
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

type Rounder = (value: number) => number;

/** 用于 slider 步长小于 1 的字段（如 logoScale 的 0.1 步长），保留一位小数 */
const roundToOneDecimal: Rounder = (value) => Math.round(value * 10) / 10;

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
    logoScale: pickNumber(record, "logoScale", DEFAULT_SETTINGS.logoScale, 0.2, 5, roundToOneDecimal),
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
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/settings.test.ts`
Expected: PASS，14 个用例。

- [ ] **Step 6: 跑通完整检查并提交**

Run: `npm run check`
Expected: 测试通过、lint 无输出、`dist/` 生成 `main.js` `manifest.json` `styles.css`。

`src/main.ts` 此时还不存在，`esbuild` 会因找不到入口而失败。先写一个最小可加载的入口，Task 9 再替换：

```ts
import { Plugin } from "obsidian";

export default class CardHomeTabPlugin extends Plugin {}
```

```bash
git add -A
git commit -m "chore: 搭建工程骨架与设置纯函数"
```

---

### Task 2: `%%card:%%` 元数据解析与生成

**Files:**
- Create: `src/dashboard/metadata.ts`
- Test: `tests/metadata.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `CardMetaEntry`、`CardMeta`、`DEFAULT_CARD_META`、`AUTO_CSS`、`parseCardMeta(line: string): CardMeta | null`、`serializeCardMeta(meta: CardMeta): string`、`isAutoCss(meta: CardMeta): boolean`、`isDefaultMeta(meta: CardMeta): boolean`

- [ ] **Step 1: 写失败的测试**

`tests/metadata.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARD_META,
  isAutoCss,
  isDefaultMeta,
  parseCardMeta,
  serializeCardMeta,
} from "../src/dashboard/metadata";

describe("parseCardMeta", () => {
  it("returns null for lines that are not card metadata", () => {
    expect(parseCardMeta("## 标题")).toBeNull();
    expect(parseCardMeta("普通文本")).toBeNull();
    expect(parseCardMeta("%% 只是注释 %%")).toBeNull();
    expect(parseCardMeta("%%card: css=text")).toBeNull();
  });

  it("parses an empty body into defaults", () => {
    expect(parseCardMeta("%%card:%%")).toEqual(DEFAULT_CARD_META);
  });

  it("parses every known key", () => {
    const meta = parseCardMeta("%%card: css=base,text; span=2; icon=lucide-chart%%");
    expect(meta).not.toBeNull();
    expect(meta!.css).toEqual(["base", "text"]);
    expect(meta!.span).toBe(2);
    expect(meta!.icon).toBe("lucide-chart");
    expect(meta!.entries).toEqual([]);
  });

  it("tolerates spacing", () => {
    const meta = parseCardMeta("%%card:  css = base ;  span = 3 %%");
    expect(meta!.css).toEqual(["base"]);
    expect(meta!.span).toBe(3);
  });

  it("falls back to defaults for malformed known values", () => {
    const meta = parseCardMeta("%%card: css=; span=abc; span=0%%");
    expect(meta!.css).toEqual([]);
    expect(meta!.span).toBe(1);
  });

  it("keeps unknown keys verbatim in order", () => {
    const meta = parseCardMeta("%%card: css=base; foo=bar; baz=a=b%%");
    expect(meta!.entries).toEqual([
      { key: "foo", value: "bar" },
      { key: "baz", value: "a=b" },
    ]);
  });

  it("ignores entries without a key", () => {
    const meta = parseCardMeta("%%card: css=base; =oops; ;%%");
    expect(meta!.entries).toEqual([]);
  });
});

describe("serializeCardMeta", () => {
  it("returns an empty string for default meta", () => {
    expect(serializeCardMeta(DEFAULT_CARD_META)).toBe("");
  });

  it("emits known keys in canonical order", () => {
    expect(
      serializeCardMeta({ css: ["base", "text"], span: 2, icon: "lucide-chart", entries: [] }),
    ).toBe("%%card: css=base,text; span=2; icon=lucide-chart%%");
  });

  it("appends unknown keys after known ones", () => {
    expect(
      serializeCardMeta({ css: ["base"], span: 1, icon: "", entries: [{ key: "foo", value: "bar" }] }),
    ).toBe("%%card: css=base; foo=bar%%");
  });

  it("omits span when it is the default", () => {
    expect(serializeCardMeta({ css: [], span: 1, icon: "lucide-star", entries: [] })).toBe(
      "%%card: icon=lucide-star%%",
    );
  });

  it("round-trips through parse", () => {
    const cases = [
      "%%card: css=auto%%",
      "%%card: css=base,text; span=3; icon=lucide-chart; foo=bar%%",
      "%%card: span=2%%",
      "%%card: icon=lucide-icon%%",
    ];
    for (const line of cases) {
      const parsed = parseCardMeta(line);
      expect(parsed).not.toBeNull();
      expect(serializeCardMeta(parsed!)).toBe(line);
    }
  });
});

describe("isAutoCss / isDefaultMeta", () => {
  it("detects the auto marker wherever it appears", () => {
    expect(isAutoCss(parseCardMeta("%%card: css=auto%%")!)).toBe(true);
    expect(isAutoCss(parseCardMeta("%%card: css=auto,text%%")!)).toBe(true);
    expect(isAutoCss(parseCardMeta("%%card: css=text,auto%%")!)).toBe(true);
    expect(isAutoCss(DEFAULT_CARD_META)).toBe(false);
  });

  it("detects fully default meta", () => {
    expect(isDefaultMeta(DEFAULT_CARD_META)).toBe(true);
    expect(isDefaultMeta(parseCardMeta("%%card: span=2%%")!)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/metadata.test.ts`
Expected: FAIL — 无法解析 `../src/dashboard/metadata`。

- [ ] **Step 3: 写实现**

`src/dashboard/metadata.ts`：

```ts
export interface CardMetaEntry {
  key: string;
  value: string;
}

export interface CardMeta {
  css: string[];
  span: number;
  icon: string;
  entries: CardMetaEntry[];
}

export const AUTO_CSS = "auto";

export const DEFAULT_CARD_META: CardMeta = {
  css: [],
  span: 1,
  icon: "",
  entries: [],
};

const LINE_PATTERN = /^\s*%%card:\s*([\s\S]*?)\s*%%\s*$/;

export function parseCardMeta(line: string): CardMeta | null {
  const match = LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const meta: CardMeta = { css: [], span: 1, icon: "", entries: [] };
  for (const rawPart of (match[1] ?? "").split(";")) {
    const part = rawPart.trim();
    if (part.length === 0) {
      continue;
    }
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key.length === 0) {
      continue;
    }
    if (key === "css") {
      meta.css = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } else if (key === "span") {
      const parsed = Number.parseInt(value, 10);
      meta.span = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
    } else if (key === "icon") {
      meta.icon = value;
    } else {
      meta.entries.push({ key, value });
    }
  }
  return meta;
}

export function serializeCardMeta(meta: CardMeta): string {
  const parts: string[] = [];
  if (meta.css.length > 0) {
    parts.push(`css=${meta.css.join(",")}`);
  }
  if (meta.span > 1) {
    parts.push(`span=${meta.span}`);
  }
  if (meta.icon.length > 0) {
    parts.push(`icon=${meta.icon}`);
  }
  for (const entry of meta.entries) {
    parts.push(`${entry.key}=${entry.value}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `%%card: ${parts.join("; ")}%%`;
}

export function isAutoCss(meta: CardMeta): boolean {
  return meta.css.includes(AUTO_CSS);
}

export function isDefaultMeta(meta: CardMeta): boolean {
  return (
    meta.css.length === 0 && meta.span <= 1 && meta.icon.length === 0 && meta.entries.length === 0
  );
}
```

`isAutoCss` 问的是"这张卡片请求了自动检测吗"，所以判据是列表里**有没有** `auto`，而不是"是否只有 `auto`"。这两者的差别正是 Task 5 那个缺陷的根源：`resolveSnippetRefs` 曾用 `length === 1 && css[0] === "auto"` 判断，于是 `css=auto,text` 里的 `auto` 被当成片段名丢掉；修好 `resolveSnippetRefs` 之后如果 `isAutoCss` 还留着旧判据，同一个问题就会在下一处被重新引入——两处对"是不是 auto"给出相反答案。Task 14 的卡片设置弹窗可以用它来判断"自动"复选框是否勾选。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/metadata.test.ts`
Expected: PASS，14 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/dashboard/metadata.ts tests/metadata.test.ts
git commit -m "feat: 支持 %%card:%% 卡片元数据注释的解析与生成"
```

---

### Task 3: 围栏识别与仪表盘文件解析

**Files:**
- Create: `src/fences.ts`, `src/dashboard/parse.ts`
- Test: `tests/fences.test.ts`, `tests/parse.test.ts`

**Interfaces:**
- Consumes: `CardMeta`、`parseCardMeta`（Task 2）
- Produces:
  - `interface Fence { marker: string; length: number }`
  - `matchFenceOpening(line: string): { fence: Fence; info: string } | null`
  - `isFenceClosing(fence: Fence, line: string): boolean`
  - `CardSection`、`parseDashboard(text: string, headingLevel: number): CardSection[]`、`sectionBody(text: string, section: CardSection): string`

`src/fences.ts` 是 `dashboard/parse.ts` 与 `auto-snippets.ts`（Task 5）共用的围栏识别逻辑，单独成模块避免同一套规则被抄两份。

`CardSection` 的形状：

```ts
interface CardSection {
  index: number;
  title: string;
  meta: CardMeta;
  start: number;      // 标题行起始偏移
  end: number;        // 下一个终止标题行起始偏移，或文本长度
  bodyStart: number;  // 正文起始偏移（元数据行之后，或标题行之后）
  metaRange: { start: number; end: number } | null;
}
```

- [ ] **Step 1: 写围栏识别失败的测试**

`tests/fences.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { isFenceClosing, matchFenceOpening } from "../src/fences";

describe("matchFenceOpening", () => {
  it("matches backtick and tilde fences", () => {
    expect(matchFenceOpening("```")).toEqual({ fence: { marker: "`", length: 3 }, info: "" });
    expect(matchFenceOpening("~~~")).toEqual({ fence: { marker: "~", length: 3 }, info: "" });
  });

  it("captures the language info string", () => {
    expect(matchFenceOpening("```dataviewjs")).toEqual({
      fence: { marker: "`", length: 3 },
      info: "dataviewjs",
    });
  });

  it("accepts up to three leading spaces", () => {
    expect(matchFenceOpening("   ```js")).toEqual({
      fence: { marker: "`", length: 3 },
      info: "js",
    });
    expect(matchFenceOpening("    ```js")).toBeNull();
  });

  it("records the run length so longer fences can nest shorter ones", () => {
    expect(matchFenceOpening("````")).toEqual({ fence: { marker: "`", length: 4 }, info: "" });
  });

  it("rejects a fence marker that is not at the start of a line", () => {
    expect(matchFenceOpening("文字 ```base 文字")).toBeNull();
    expect(matchFenceOpening("`行内代码`")).toBeNull();
  });
});

describe("isFenceClosing", () => {
  const backtick3 = { marker: "`", length: 3 };

  it("accepts the same character with equal or greater length", () => {
    expect(isFenceClosing(backtick3, "```")).toBe(true);
    expect(isFenceClosing(backtick3, "````")).toBe(true);
  });

  it("rejects a shorter run or a different character", () => {
    expect(isFenceClosing(backtick3, "``")).toBe(false);
    expect(isFenceClosing(backtick3, "~~~")).toBe(false);
  });

  it("rejects trailing content", () => {
    expect(isFenceClosing(backtick3, "```js")).toBe(false);
  });

  it("allows trailing whitespace and leading indentation", () => {
    expect(isFenceClosing(backtick3, "  ```  ")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/fences.test.ts`
Expected: FAIL — 无法解析 `../src/fences`。

- [ ] **Step 3: 写围栏识别实现**

`src/fences.ts`：

```ts
export interface Fence {
  marker: string;
  length: number;
}

const OPENING_PATTERN = /^ {0,3}(`{3,}|~{3,})([^\s`~]*)/;

export function matchFenceOpening(line: string): { fence: Fence; info: string } | null {
  const match = OPENING_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const run = match[1]!;
  return { fence: { marker: run[0]!, length: run.length }, info: match[2] ?? "" };
}

export function isFenceClosing(fence: Fence, line: string): boolean {
  return new RegExp(`^ {0,3}\\${fence.marker}{${fence.length},}\\s*$`).test(line);
}
```

- [ ] **Step 4: 运行围栏测试确认通过**

Run: `npx vitest run tests/fences.test.ts`
Expected: PASS，9 个用例。

- [ ] **Step 5: 写解析失败的测试**

`tests/parse.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { parseDashboard, sectionBody } from "../src/dashboard/parse";

describe("parseDashboard", () => {
  it("returns an empty list when there is no heading at the target level", () => {
    expect(parseDashboard("# 只有一级标题\n正文\n", 2)).toEqual([]);
    expect(parseDashboard("没有标题\n", 2)).toEqual([]);
    expect(parseDashboard("", 2)).toEqual([]);
  });

  it("splits on the configured heading level only", () => {
    const text = ["# 页首", "## 一", "内容一", "### 更深，不切分", "还是内容一", "## 二", "内容二", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["一", "二"]);
    expect(sectionBody(text, sections[0]!)).toContain("### 更深，不切分");
    expect(sectionBody(text, sections[1]!)).toBe("内容二\n");
  });

  it("does not split on headings inside fenced code blocks", () => {
    const text = [
      "## 代码卡",
      "```md",
      "## 这行不是标题",
      "~~~",
      "## 这行也不是",
      "```",
      "尾部",
      "## 第二张",
      "内容",
      "",
    ].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["代码卡", "第二张"]);
    expect(sectionBody(text, sections[0]!)).toContain("## 这行不是标题");
  });

  it("closes a fence only with a matching character and enough length", () => {
    const text = ["## 卡", "````", "~~~", "```", "still inside", "````", "## 下一张", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["卡", "下一张"]);
    expect(sectionBody(text, sections[0]!)).toContain("still inside");
  });

  it("keeps a fence open to the end of the file", () => {
    const text = ["## 卡", "```", "## 未闭合也不是标题", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["卡"]);
  });

  it("skips YAML frontmatter", () => {
    const text = ["---", "title: 首页", "## 不是卡片", "---", "## 真卡片", "内容", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["真卡片"]);
  });

  it("ends a card at a higher-level heading", () => {
    const text = ["## 卡", "内容", "# 中断", "被排除", "## 下一张", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["卡", "下一张"]);
    expect(sectionBody(text, sections[0]!)).not.toContain("被排除");
  });

  it("reads the metadata line directly after the heading", () => {
    const text = ["## 卡", "%%card: css=base; span=2%%", "内容", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.meta.css).toEqual(["base"]);
    expect(section!.meta.span).toBe(2);
    expect(sectionBody(text, section!)).toBe("内容\n");
  });

  it("only accepts the metadata line as the first non-empty line", () => {
    const text = ["## 卡", "先有内容", "%%card: css=base%%", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.meta.css).toEqual([]);
    expect(section!.metaRange).toBeNull();
    expect(sectionBody(text, section!)).toContain("%%card: css=base%%");
  });

  it("allows blank lines between the heading and the metadata line", () => {
    const text = ["## 卡", "", "%%card: css=base%%", "内容", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.meta.css).toEqual(["base"]);
    expect(sectionBody(text, section!)).toBe("内容\n");
  });

  it("does not treat a metadata line inside a code block as metadata", () => {
    const text = ["## 卡", "```", "%%card: css=base%%", "```", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.metaRange).toBeNull();
    expect(section!.meta.css).toEqual([]);
  });

  it("reports byte-accurate ranges", () => {
    const text = ["前言", "## 甲", "正文甲", "## 乙", "正文乙"].join("\n");
    const sections = parseDashboard(text, 2);
    const [first, second] = sections;
    expect(text.slice(first!.start, first!.end)).toBe("## 甲\n正文甲\n");
    expect(text.slice(second!.start, second!.end)).toBe("## 乙\n正文乙");
    expect(first!.bodyStart).toBe(text.indexOf("正文甲"));
  });

  it("gives the last section the end of the file", () => {
    const text = "## 唯一\n内容\n";
    const [section] = parseDashboard(text, 2);
    expect(section!.end).toBe(text.length);
  });

  it("indexes sections from zero in file order", () => {
    const text = ["## 甲", "## 乙", "## 丙", ""].join("\n");
    expect(parseDashboard(text, 2).map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("honours a custom heading level", () => {
    const text = ["## 不是卡片", "### 是卡片", "内容", ""].join("\n");
    const sections = parseDashboard(text, 3);
    expect(sections.map((s) => s.title)).toEqual(["是卡片"]);
  });

  it("rejects headings without a space after the hashes", () => {
    expect(parseDashboard("##没有空格\n", 2)).toEqual([]);
  });

  it("strips a closing sequence of hashes from the title", () => {
    const sections = parseDashboard("## 标题 ##\n", 2);
    expect(sections[0]!.title).toBe("标题");
  });

  it("accepts up to three leading spaces", () => {
    expect(parseDashboard("   ## 缩进标题\n", 2).map((s) => s.title)).toEqual(["缩进标题"]);
    expect(parseDashboard("    ## 四格不算标题\n", 2)).toEqual([]);
  });

  it("parses an empty section with no body", () => {
    const text = "## 空卡片\n## 下一张\n";
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["空卡片", "下一张"]);
    expect(sectionBody(text, sections[0]!)).toBe("");
  });

  it("handles CRLF line endings without losing every heading", () => {
    const text = "## 甲\r\n正文\r\n## 乙\r\n正文\r\n";
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["甲", "乙"]);
    expect(sectionBody(text, sections[0]!)).toBe("正文\r\n");
  });
});
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npx vitest run tests/parse.test.ts`
Expected: FAIL — 无法解析 `../src/dashboard/parse`。

- [ ] **Step 7: 写解析实现**

`src/dashboard/parse.ts`：

```ts
import { isFenceClosing, matchFenceOpening, type Fence } from "../fences";
import { parseCardMeta, type CardMeta } from "./metadata";

export interface CardSection {
  index: number;
  title: string;
  meta: CardMeta;
  start: number;
  end: number;
  bodyStart: number;
  metaRange: { start: number; end: number } | null;
}

interface Line {
  text: string;
  start: number;
  end: number;
}

function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines.push({ text: text.slice(start, i).replace(/\r$/, ""), start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < text.length) {
    lines.push({ text: text.slice(start).replace(/\r$/, ""), start, end: text.length });
  }
  return lines;
}

function headingMatch(line: string): { level: number; title: string } | null {
  const match = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(line);
  if (!match) {
    return null;
  }
  const title = (match[2] ?? "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();
  return { level: match[1]!.length, title };
}

function frontmatterEnd(lines: Line[]): number {
  const first = lines[0];
  if (!first || first.text.trim() !== "---") {
    return -1;
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.text.trim() === "---") {
      return i;
    }
  }
  return -1;
}

function freshMeta(): CardMeta {
  return { css: [], span: 1, icon: "", entries: [] };
}

export function parseDashboard(text: string, headingLevel: number): CardSection[] {
  const lines = toLines(text);
  const skipThrough = frontmatterEnd(lines);
  const sections: CardSection[] = [];
  const headingLineIndex = new Map<CardSection, number>();

  let fence: Fence | null = null;
  let current: CardSection | null = null;

  const closeCurrent = (end: number): void => {
    if (current) {
      current.end = end;
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i <= skipThrough) {
      continue;
    }
    if (fence) {
      if (isFenceClosing(fence, line.text)) {
        fence = null;
      }
      continue;
    }
    const opening = matchFenceOpening(line.text);
    if (opening) {
      fence = opening.fence;
      continue;
    }
    const heading = headingMatch(line.text);
    if (!heading || heading.level > headingLevel) {
      continue;
    }
    closeCurrent(line.start);
    if (heading.level < headingLevel) {
      continue;
    }
    const section: CardSection = {
      index: sections.length,
      title: heading.title,
      meta: freshMeta(),
      start: line.start,
      end: text.length,
      bodyStart: line.end,
      metaRange: null,
    };
    sections.push(section);
    headingLineIndex.set(section, i);
    current = section;
  }
  closeCurrent(text.length);

  for (const section of sections) {
    const headingIndex = headingLineIndex.get(section)!;
    for (let j = headingIndex + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.start >= section.end) {
        break;
      }
      if (line.text.trim().length === 0) {
        continue;
      }
      if (matchFenceOpening(line.text)) {
        break;
      }
      const meta = parseCardMeta(line.text);
      if (meta) {
        section.meta = meta;
        section.metaRange = { start: line.start, end: line.end };
        section.bodyStart = line.end;
      }
      break;
    }
  }
  return sections;
}

export function sectionBody(text: string, section: CardSection): string {
  return text.slice(section.bodyStart, section.end);
}
```

元数据扫描是第二个独立循环，遇到围栏起始行直接 `break`，因此代码块里的 `%%card:%%` 不会被误判。

- [ ] **Step 8: 运行解析测试确认通过**

Run: `npx vitest run tests/parse.test.ts`
Expected: PASS，20 个用例。

`toLines` 里 `replace(/\r$/, "")` 不是可有可无的清理：JS 正则的 `.` 不匹配 `\r`，所以 CRLF 文件里 `"## 甲\r"` 会让 `headingMatch` 的 `(.*?)[ \t]*$` 永远到不了 `$`，返回 `null`，结果是**一个标题都识别不出来、整个首页一张卡片都不显示**，而且没有任何报错。`\r` 只从用于匹配的行文本里剥掉，`start`/`end` 仍指向原始文本，所以 Task 4 的区间拼接保真性不受影响。

- [ ] **Step 9: 跑全量测试并提交**

Run: `npm test`
Expected: `tests/fences.test.ts` 9 个 + `tests/parse.test.ts` 20 个 + 之前的用例全部通过。

```bash
git add src/fences.ts src/dashboard/parse.ts tests/fences.test.ts tests/parse.test.ts
git commit -m "feat: 围栏识别抽成共享模块，仪表盘按标题切分卡片"
```

---

### Task 4: Section 增删改移（逐字节保真）

**Files:**
- Create: `src/dashboard/edit.ts`
- Test: `tests/edit.test.ts`

**Interfaces:**
- Consumes: `CardSection`、`sectionBody`（Task 3）；`CardMeta`、`serializeCardMeta`（Task 2）
- Produces: `updateCardMeta(text: string, section: CardSection, meta: CardMeta): string`、`removeCard(text: string, section: CardSection): string`、`moveCard(text: string, sections: CardSection[], from: number, to: number): string`、`appendCard(text: string, headingLevel: number, title: string, meta: CardMeta, body: string): string`

- [ ] **Step 1: 写失败的测试**

`tests/edit.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { appendCard, moveCard, removeCard, updateCardMeta } from "../src/dashboard/edit";
import { parseCardMeta } from "../src/dashboard/metadata";
import { parseDashboard } from "../src/dashboard/parse";

const meta = (line: string) => parseCardMeta(line)!;

describe("updateCardMeta", () => {
  it("inserts a metadata line when the card has none", () => {
    const text = "## 卡\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: css=base%%"))).toBe(
      "## 卡\n%%card: css=base%%\n内容\n",
    );
  });

  it("replaces an existing metadata line", () => {
    const text = "## 卡\n%%card: css=base%%\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: span=2%%"))).toBe(
      "## 卡\n%%card: span=2%%\n内容\n",
    );
  });

  it("removes the metadata line when the new meta is empty", () => {
    const text = "## 卡\n%%card: css=base%%\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card:%%"))).toBe("## 卡\n内容\n");
  });

  it("keeps a blank line the user placed between heading and metadata", () => {
    const text = "## 卡\n\n%%card: css=base%%\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: css=text%%"))).toBe(
      "## 卡\n\n%%card: css=text%%\n内容\n",
    );
  });

  it("leaves every other card byte-identical", () => {
    const text = [
      "前言",
      "",
      "## 甲",
      "甲内容",
      "",
      "## 乙",
      "%%card: css=old%%",
      "乙内容",
      "",
      "## 丙",
      "丙内容",
    ].join("\n");
    const sections = parseDashboard(text, 2);
    const next = updateCardMeta(text, sections[1]!, meta("%%card: css=new; span=2%%"));
    expect(next).toBe(text.replace("%%card: css=old%%", "%%card: css=new; span=2%%"));
  });

  it("does not weld the metadata line onto a heading that ends the file", () => {
    const text = "## 卡";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: css=base%%"))).toBe(
      "## 卡\n%%card: css=base%%\n",
    );
  });
});

describe("removeCard", () => {
  it("removes the heading, metadata and body", () => {
    const text = "## 甲\n%%card: css=base%%\n甲内容\n## 乙\n乙内容\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("## 乙\n乙内容\n");
  });

  it("keeps the text before the first card untouched", () => {
    const text = "# 页首\n\n## 甲\n内容\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("# 页首\n\n");
  });

  it("keeps page-level text that follows the removed card", () => {
    const text = "## 甲\n甲内容\n# 中断\n页级正文\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("# 中断\n页级正文\n");
  });

  it("removes the only card", () => {
    const text = "## 甲\n内容\n";
    expect(removeCard(text, parseDashboard(text, 2)[0]!)).toBe("");
  });

  it("does not touch the second card when removing the first", () => {
    const text = "## 甲\n甲内容\n## 乙\n%%card: css=base%%\n乙内容\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("## 乙\n%%card: css=base%%\n乙内容\n");
  });

  it("preserves CRLF bytes when removing a section", () => {
    const crlf = "## 甲\r\n正文甲\r\n## 乙\r\n正文乙\r\n";
    const sections = parseDashboard(crlf, 2);
    expect(removeCard(crlf, sections[0]!)).toBe("## 乙\r\n正文乙\r\n");
  });
});

describe("moveCard", () => {
  const text = ["# 页首", "", "## 甲", "甲内容", "## 乙", "乙内容", "## 丙", "丙内容", ""].join("\n");

  it("moves a card later", () => {
    const sections = parseDashboard(text, 2);
    expect(parseDashboard(moveCard(text, sections, 0, 2), 2).map((s) => s.title)).toEqual([
      "乙",
      "丙",
      "甲",
    ]);
  });

  it("moves a card earlier", () => {
    const sections = parseDashboard(text, 2);
    expect(parseDashboard(moveCard(text, sections, 2, 0), 2).map((s) => s.title)).toEqual([
      "丙",
      "甲",
      "乙",
    ]);
  });

  it("is a no-op for equal or out-of-range indexes", () => {
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 0)).toBe(text);
    expect(moveCard(text, sections, 5, 0)).toBe(text);
    expect(moveCard(text, sections, 0, 5)).toBe(text);
  });

  it("does not mutate the caller's section array", () => {
    const sections = parseDashboard(text, 2);
    moveCard(text, sections, 0, 2);
    expect(sections.map((s) => s.title)).toEqual(["甲", "乙", "丙"]);
  });

  it("preserves the leading page content", () => {
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 2).startsWith("# 页首\n\n")).toBe(true);
  });

  it("appends a trailing newline when the file had none", () => {
    const noTrailing = "## 甲\n甲内容\n## 乙\n乙内容";
    const sections = parseDashboard(noTrailing, 2);
    expect(moveCard(noTrailing, sections, 0, 1)).toBe("## 乙\n乙内容\n## 甲\n甲内容\n");
  });

  it("keeps the body of each card with its heading", () => {
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 1, 2)).toContain("## 丙\n丙内容\n## 乙\n乙内容\n");
  });

  it("preserves CRLF bytes when moving sections", () => {
    const crlf = "## 甲\r\n正文甲\r\n## 乙\r\n正文乙\r\n";
    const sections = parseDashboard(crlf, 2);
    expect(moveCard(crlf, sections, 0, 1)).toBe("## 乙\r\n正文乙\r\n## 甲\r\n正文甲\r\n");
  });

  it("keeps page-level text that sits between two cards", () => {
    const text = "## 甲\n甲内容\n# 中断\n页级正文\n## 乙\n乙内容\n";
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 1)).toBe(
      "## 乙\n乙内容\n# 中断\n页级正文\n## 甲\n甲内容\n",
    );
  });

  it("keeps page-level text that follows the last card", () => {
    const text = "## 甲\n甲内容\n## 乙\n乙内容\n# 尾题\n尾正文\n";
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 1)).toBe(
      "## 乙\n乙内容\n## 甲\n甲内容\n# 尾题\n尾正文\n",
    );
  });
});

describe("appendCard", () => {
  it("appends to an empty file", () => {
    expect(appendCard("", 2, "新卡片", meta("%%card:%%"), "内容")).toBe("## 新卡片\n内容\n");
  });

  it("appends a metadata line when present", () => {
    expect(appendCard("", 2, "新卡片", meta("%%card: css=base%%"), "内容")).toBe(
      "## 新卡片\n%%card: css=base%%\n内容\n",
    );
  });

  it("adds the missing newline before appending", () => {
    expect(appendCard("## 甲\n甲内容", 2, "乙", meta("%%card:%%"), "乙内容")).toBe(
      "## 甲\n甲内容\n## 乙\n乙内容\n",
    );
  });

  it("does not create a run of blank lines when the file already ends with one", () => {
    expect(appendCard("## 甲\n甲内容\n", 2, "乙", meta("%%card:%%"), "乙内容")).toBe(
      "## 甲\n甲内容\n## 乙\n乙内容\n",
    );
  });

  it("trims the provided body", () => {
    expect(appendCard("", 3, "新卡片", meta("%%card:%%"), "\n\n内容\n\n")).toBe(
      "### 新卡片\n内容\n",
    );
  });

  it("honours the heading level", () => {
    expect(appendCard("", 4, "深卡片", meta("%%card:%%"), "")).toBe("#### 深卡片\n");
  });

  it("produces a file that parses back to both cards", () => {
    const once = appendCard("", 2, "甲", meta("%%card:%%"), "甲内容");
    const twice = appendCard(once, 2, "乙", meta("%%card: css=base%%"), "乙内容");
    const sections = parseDashboard(twice, 2);
    expect(sections.map((s) => s.title)).toEqual(["甲", "乙"]);
    expect(sections[1]!.meta.css).toEqual(["base"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/edit.test.ts`
Expected: FAIL — 无法解析 `../src/dashboard/edit`。

- [ ] **Step 3: 写实现**

`src/dashboard/edit.ts`：

```ts
import { serializeCardMeta, type CardMeta } from "./metadata";
import type { CardSection } from "./parse";

const NEWLINE = "\n";

function metaLine(meta: CardMeta): string {
  const line = serializeCardMeta(meta);
  return line.length > 0 ? `${line}${NEWLINE}` : "";
}

export function updateCardMeta(text: string, section: CardSection, meta: CardMeta): string {
  const line = metaLine(meta);
  if (section.metaRange) {
    return text.slice(0, section.metaRange.start) + line + text.slice(section.metaRange.end);
  }
  if (line.length === 0) {
    return text;
  }
  const needsSeparator =
    section.bodyStart > 0 && !text.startsWith(NEWLINE, section.bodyStart - 1);
  const separator = needsSeparator ? NEWLINE : "";
  return text.slice(0, section.bodyStart) + separator + line + text.slice(section.bodyStart);
}

export function removeCard(text: string, section: CardSection): string {
  return text.slice(0, section.start) + text.slice(section.end);
}

export function moveCard(text: string, sections: CardSection[], from: number, to: number): string {
  const ordered = [...sections].sort((left, right) => left.start - right.start);
  if (from === to || from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) {
    return text;
  }
  const blocks = ordered.map((section) => {
    const block = text.slice(section.start, section.end);
    return block.endsWith(NEWLINE) ? block : block + NEWLINE;
  });
  const moved = blocks.splice(from, 1)[0]!;
  blocks.splice(to, 0, moved);
  let result = "";
  let cursor = 0;
  for (let i = 0; i < ordered.length; i++) {
    const section = ordered[i]!;
    result += text.slice(cursor, section.start) + blocks[i]!;
    cursor = section.end;
  }
  return result + text.slice(cursor);
}

export function appendCard(
  text: string,
  headingLevel: number,
  title: string,
  meta: CardMeta,
  body: string,
): string {
  const heading = `${"#".repeat(headingLevel)} ${title}`;
  const trimmed = body.trim();
  const prefix = text.length === 0 || text.endsWith(NEWLINE) ? text : text + NEWLINE;
  const header = `${heading}${NEWLINE}${metaLine(meta)}`;
  return trimmed.length > 0 ? `${prefix}${header}${trimmed}${NEWLINE}` : `${prefix}${header}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/edit.test.ts`
Expected: PASS，29 个用例。

`updateCardMeta` 里那个 `needsSeparator` 判断不是防御性冗余：当 section 的标题行就是文件的最后一行且文件末尾没有换行时，`toLines` 给它的 `end` 等于 `text.length`，`bodyStart` 也因此等于 `text.length`，而元数据扫描根本没有下一行可看（`metaRange` 为 `null`）。此时直接 `slice(0, bodyStart) + line + slice(bodyStart)` 会把元数据行**焊在标题行上**——结果是标题变成 `卡%%card: css=base%%`，元数据整行丢失，卡片渲染时也就没有任何片段样式。加一个分隔换行即可。

`moveCard` 用 `text.slice(cursor, section.start) + blocks[i]` 逐段拼回，而不是 `head + blocks.join("") + tail`。两者的差别只在"卡片之间夹着页面级文本"时显现：`parseDashboard` 让 section 终止于更高级标题，因此两个卡片之间可以存在**不属于任何 section** 的字节（例如文档中段的 `# 分区标题` 及其正文）。用 `head + join + tail` 拼会把这些字节静默丢掉——测过的例子是 10 个字节整段消失。逐段拼接把每个 section 的新内容写回它原来的位置区间，间隙一字不动。

`moveCard` / `removeCard` 是纯区间拼接，必须原样保留 CRLF 字节；那两条 CRLF 测试就是钉这一点。**已知限制**：`updateCardMeta` 与 `appendCard` 插入的新行固定用 `\n`，所以在 CRLF 文件里这两处会产生混合行尾。功能与解析都不受影响（`toLines` 已剥 `\r`），只是 git diff 里那一行会显得突兀。收益不足以在本版引入行尾探测，记入 README 的已知限制。

- [ ] **Step 5: 提交**

```bash
git add src/dashboard/edit.ts tests/edit.test.ts
git commit -m "feat: section 增删改移，文件其余部分逐字节保真"
```

---

### Task 5: `css=auto` 内容类型推断

**Files:**
- Create: `src/auto-snippets.ts`
- Test: `tests/auto-snippets.test.ts`

**Interfaces:**
- Consumes: `CardMeta`、`AUTO_CSS`（Task 2）；`Fence`、`matchFenceOpening`、`isFenceClosing`（Task 3）
- Produces: `BUILTIN_SNIPPET_NAMES: readonly string[]`、`detectContentSnippets(markdown: string): string[]`、`resolveSnippetRefs(meta: CardMeta, markdown: string): string[]`

约定：`detectContentSnippets` 返回不带前缀的片段名（`text` / `code` / `base` / `query` / `dataview`），顺序固定；`resolveSnippetRefs` 返回带前缀的完整引用，裸名按 `builtin:` 处理。

- [ ] **Step 1: 写失败的测试**

`tests/auto-snippets.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { detectContentSnippets, resolveSnippetRefs } from "../src/auto-snippets";
import { parseCardMeta } from "../src/dashboard/metadata";

const meta = (line: string) => parseCardMeta(line)!;

describe("detectContentSnippets", () => {
  it("always includes the text snippet", () => {
    expect(detectContentSnippets("就是一段普通文字")).toEqual(["text"]);
    expect(detectContentSnippets("")).toEqual(["text"]);
  });

  it("detects a fenced code block", () => {
    expect(detectContentSnippets("```\ncode\n```")).toEqual(["text", "code"]);
    expect(detectContentSnippets("```js\nconst a = 1;\n```")).toEqual(["text", "code"]);
  });

  it("detects base, query and dataview blocks", () => {
    expect(detectContentSnippets("```base\n```")).toEqual(["text", "code", "base"]);
    expect(detectContentSnippets("```query\n```")).toEqual(["text", "code", "query"]);
    expect(detectContentSnippets("```dataview\ntable x\n```")).toEqual(["text", "code", "dataview"]);
    expect(detectContentSnippets("```dataviewjs\ndv.pages()\n```")).toContain("dataview");
  });

  it("treats the language case-insensitively", () => {
    expect(detectContentSnippets("```BASE\n```")).toContain("base");
  });

  it("detects embedded .base files", () => {
    expect(detectContentSnippets("![[我的表.base]]")).toEqual(["text", "base"]);
    expect(detectContentSnippets("![[子目录/我的表.base]]")).toEqual(["text", "base"]);
    expect(detectContentSnippets("![[我的表.base|别名]]")).toEqual(["text", "base"]);
  });

  it("ignores plain prose that merely names a language", () => {
    expect(detectContentSnippets("## 关于 dataview 的笔记")).toEqual(["text"]);
    expect(detectContentSnippets("行内 `dataview` 不算")).toEqual(["text"]);
  });

  it("ignores a fence marker that is not at the start of a line", () => {
    expect(detectContentSnippets("文字 ```base 文字")).toEqual(["text"]);
  });

  it("does not rescan the inside of a code block", () => {
    expect(detectContentSnippets("```js\nconst s = '![[x.base]]';\n```")).toEqual(["text", "code"]);
  });

  it("returns names in a stable order without duplicates", () => {
    expect(detectContentSnippets("```base\n```\n```query\n```\n```base\n```")).toEqual([
      "text",
      "code",
      "base",
      "query",
    ]);
  });

  it("keeps a fence open to the end of the text", () => {
    expect(detectContentSnippets("```query\n```base\n```")).toEqual(["text", "code", "query"]);
  });
});

describe("resolveSnippetRefs", () => {
  it("returns the explicit list when css is set", () => {
    expect(resolveSnippetRefs(meta("%%card: css=base,user:mine%%"), "```query\n```")).toEqual([
      "builtin:base",
      "user:mine",
    ]);
  });

  it("keeps already-prefixed references untouched", () => {
    expect(resolveSnippetRefs(meta("%%card: css=user:mine,builtin:code%%"), "")).toEqual([
      "user:mine",
      "builtin:code",
    ]);
  });

  it("expands auto into prefixed builtin references", () => {
    expect(resolveSnippetRefs(meta("%%card: css=auto%%"), "```base\n```")).toEqual([
      "builtin:text",
      "builtin:code",
      "builtin:base",
    ]);
  });

  it("returns nothing when css is empty", () => {
    expect(resolveSnippetRefs(meta("%%card:%%"), "```base\n```")).toEqual([]);
  });

  it("expands auto wherever it appears and keeps the other references", () => {
    expect(resolveSnippetRefs(meta("%%card: css=auto,user:mine%%"), "```base\n```")).toEqual([
      "builtin:text",
      "builtin:code",
      "builtin:base",
      "user:mine",
    ]);
    expect(resolveSnippetRefs(meta("%%card: css=user:mine,auto%%"), "```base\n```")).toEqual([
      "user:mine",
      "builtin:text",
      "builtin:code",
      "builtin:base",
    ]);
  });

  it("does not emit the same reference twice", () => {
    expect(resolveSnippetRefs(meta("%%card: css=auto,text%%"), "")).toEqual(["builtin:text"]);
    expect(resolveSnippetRefs(meta("%%card: css=base,builtin:base%%"), "")).toEqual([
      "builtin:base",
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/auto-snippets.test.ts`
Expected: FAIL — 无法解析 `../src/auto-snippets`。

- [ ] **Step 3: 写实现**

`src/auto-snippets.ts`：

```ts
import { isFenceClosing, matchFenceOpening, type Fence } from "./fences";
import { AUTO_CSS, type CardMeta } from "./dashboard/metadata";

export const BUILTIN_SNIPPET_NAMES = ["code", "base", "query", "dataview", "text"] as const;

const ORDER = ["text", "code", "base", "query", "dataview"];

const CONTENT_LANGUAGES: Record<string, string> = {
  base: "base",
  query: "query",
  dataview: "dataview",
  dataviewjs: "dataview",
};

const BASE_EMBED_PATTERN = /!\[\[[^\]]*\.base(\|[^\]]*)?\]\]/i;

export function detectContentSnippets(markdown: string): string[] {
  const found = new Set<string>(["text"]);
  let fence: Fence | null = null;

  for (const line of markdown.split("\n")) {
    if (fence) {
      if (isFenceClosing(fence, line)) {
        fence = null;
      }
      continue;
    }
    const opening = matchFenceOpening(line);
    if (opening) {
      const language = opening.info.toLowerCase();
      found.add("code");
      const mapped = CONTENT_LANGUAGES[language];
      if (mapped) {
        found.add(mapped);
      }
      fence = opening.fence;
      continue;
    }
    if (BASE_EMBED_PATTERN.test(line)) {
      found.add("base");
    }
  }

  return ORDER.filter((name) => found.has(name));
}

export function resolveSnippetRefs(meta: CardMeta, markdown: string): string[] {
  if (meta.css.length === 0) {
    return [];
  }
  const refs: string[] = [];
  const seen = new Set<string>();
  const push = (ref: string): void => {
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  };
  for (const entry of meta.css) {
    if (entry === AUTO_CSS) {
      for (const name of detectContentSnippets(markdown)) {
        push(`builtin:${name}`);
      }
      continue;
    }
    push(entry.includes(":") ? entry : `builtin:${entry}`);
  }
  return refs;
}
```

`auto` 在列表里**任何位置**都展开，而不是"仅当它是唯一一项"。原实现要求 `css.length === 1 && css[0] === AUTO_CSS`，于是 `%%card: css=auto,text%%` 会把 `auto` 当成片段名，产出并不存在的 `builtin:auto`，被片段仓库静默忽略——用户想要"自动 + 我的片段"，实际只拿到 `text`，自动检测完全失效且没有任何提示。设计文档只说"`css=auto` 表示按内容类型自动套用"，从未规定它必须单独出现，所以那个 `length === 1` 是代码自带的限制而非需求。

展开之后必须去重：`css=auto,text` 里 `auto` 已展开出 `builtin:text`，显式那项再推一次就成了重复注入。`seen` 集合按首次出现顺序保留。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/auto-snippets.test.ts`
Expected: PASS，16 个用例。

- [ ] **Step 5: 提交**

```bash
git add src/auto-snippets.ts tests/auto-snippets.test.ts
git commit -m "feat: css=auto 按内容类型推断内置片段"
```

---

### Task 6: `@scope` 作用域包裹

**Files:**
- Create: `src/snippet-scope.ts`
- Test: `tests/snippet-scope.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `cardScopeSelector(cardId: string): string`、`containsImport(css: string): boolean`、`scopeSnippet(css: string, cardId: string): string`、`scopedStylesheet(parts: { ref: string; css: string }[], cardId: string): string`

- [ ] **Step 1: 写失败的测试**

`tests/snippet-scope.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  cardScopeSelector,
  containsImport,
  scopeSnippet,
  scopedStylesheet,
} from "../src/snippet-scope";

const selector = (id: string) => `.home-card.home-card[data-card-id="${id}"]`;

describe("cardScopeSelector", () => {
  it("repeats the card class to raise specificity", () => {
    expect(cardScopeSelector("card-0")).toBe(selector("card-0"));
  });
});

describe("containsImport", () => {
  it("detects @import in every spelling", () => {
    expect(containsImport('@import url("x.css");')).toBe(true);
    expect(containsImport("@import 'x.css';")).toBe(true);
    expect(containsImport("@IMPORT url(x.css);")).toBe(true);
  });

  it("does not treat @import inside a comment as an import", () => {
    expect(containsImport("/* @import url(x.css); */ .a{color:red}")).toBe(false);
  });

  it("returns false for ordinary css", () => {
    expect(containsImport(".a { color: red; }")).toBe(false);
  });
});

describe("scopeSnippet", () => {
  it("wraps the snippet in an @scope block", () => {
    const result = scopeSnippet(".a { color: red; }", "card-1");
    expect(result).toContain(`@scope (${selector("card-1")})`);
    expect(result).toContain(".a { color: red; }");
  });

  it("rewrites :root to :scope", () => {
    const result = scopeSnippet(":root { --x: 1; }", "card-1");
    expect(result).toContain(":scope { --x: 1; }");
    expect(result).not.toContain(":root");
  });

  it("does not rewrite :root inside a declaration value", () => {
    const result = scopeSnippet('.a::after { content: ":root"; }', "card-1");
    expect(result).toContain('content: ":root"');
  });

  it("rewrites :root that follows a comment", () => {
    const result = scopeSnippet("/* 卡片配色 */\n:root { --x: 1; }", "card-1");
    expect(result).toContain(":scope { --x: 1; }");
    expect(result).not.toContain(":root");
  });

  it("still leaves a :root inside a declaration value alone when a comment precedes it", () => {
    const result = scopeSnippet('/* c */ .a { content: ":root"; }', "card-1");
    expect(result).toContain('content: ":root"');
  });

  it("rewrites :ROOT case-insensitively", () => {
    const result = scopeSnippet(":ROOT { --x: 1; }", "card-1");
    expect(result).toContain(":scope { --x: 1; }");
    expect(result).not.toContain(":ROOT");
  });

  it("rejects a real @import that follows a leading comment", () => {
    const result = scopeSnippet('/* 说明 */\n@import url("evil.css");\n.a { color: red; }', "card-1");
    expect(result).toBe("");
  });

  it("keeps at-rules that are legal inside @scope", () => {
    const result = scopeSnippet("@media (min-width: 600px) { .a { color: red; } }", "card-1");
    expect(result).toContain("@media (min-width: 600px)");
  });

  it("returns an empty string for an empty snippet", () => {
    expect(scopeSnippet("", "card-1")).toBe("");
    expect(scopeSnippet("   \n ", "card-1")).toBe("");
  });

  it("returns an empty string when the snippet imports another file", () => {
    expect(scopeSnippet('@import url("evil.css");\n.a{color:red}', "card-1")).toBe("");
  });
});

describe("scopedStylesheet", () => {
  it("scopes every part to the same card", () => {
    const result = scopedStylesheet(
      [
        { ref: "builtin:text", css: ".t { margin: 0; }" },
        { ref: "user:mine", css: ".m { color: red; }" },
      ],
      "card-2",
    );
    expect(result.split(selector("card-2")).length - 1).toBe(2);
    expect(result.indexOf(".t { margin: 0; }")).toBeLessThan(result.indexOf(".m { color: red; }"));
  });

  it("labels each part so the origin is traceable in devtools", () => {
    expect(scopedStylesheet([{ ref: "builtin:base", css: ".b{}" }], "card-2")).toContain(
      "builtin:base",
    );
  });

  it("does not let a reference close its own label comment", () => {
    const result = scopedStylesheet(
      [{ ref: "x */ .evil { display: none } /*", css: ".a {}" }],
      "card-2",
    );
    const label = result.slice(0, result.indexOf("\n"));
    expect(label.startsWith("/* ")).toBe(true);
    expect(label.endsWith(" */")).toBe(true);
    expect(label.slice(3, -3)).not.toContain("*/");
    expect(result).toContain(`@scope (${selector("card-2")})`);
  });

  it("skips parts that resolve to an empty snippet", () => {
    const result = scopedStylesheet(
      [
        { ref: "builtin:text", css: "" },
        { ref: "user:mine", css: ".m{}" },
      ],
      "card-2",
    );
    expect(result).not.toContain("builtin:text");
    expect(result).toContain(".m{}");
  });

  it("returns an empty string when there are no parts", () => {
    expect(scopedStylesheet([], "card-2")).toBe("");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/snippet-scope.test.ts`
Expected: FAIL — 无法解析 `../src/snippet-scope`。

- [ ] **Step 3: 写实现**

`src/snippet-scope.ts`：

```ts
export function cardScopeSelector(cardId: string): string {
  return `.home-card.home-card[data-card-id="${cardId}"]`;
}

const IMPORT_PATTERN = /@import\b/i;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const ROOT_PATTERN = /(^|[{};,]|\*\/)(\s*):root\b/gi;

function stripComments(css: string): string {
  return css.replace(COMMENT_PATTERN, " ");
}

export function containsImport(css: string): boolean {
  return IMPORT_PATTERN.test(stripComments(css));
}

function rewriteRoot(css: string): string {
  return css.replace(ROOT_PATTERN, (_match, prefix: string, spacing: string) => {
    if (spacing.length > 0) {
      return `${prefix}${spacing}:scope`;
    }
    return prefix.length > 0 ? `${prefix} :scope` : ":scope";
  });
}

export function scopeSnippet(css: string, cardId: string): string {
  const trimmed = css.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (containsImport(trimmed)) {
    console.warn("[CardHomeTab] CSS snippet rejected: @import is not allowed");
    return "";
  }
  return `@scope (${cardScopeSelector(cardId)}) {\n${rewriteRoot(trimmed)}\n}`;
}

/** 标签只用于 devtools 里辨认来源；把非安全字符换掉，避免 ref 里的注释结束符提前闭合标签 */
function labelFor(ref: string): string {
  return ref.replace(/[^\w:.-]/g, "_");
}

export function scopedStylesheet(parts: { ref: string; css: string }[], cardId: string): string {
  const blocks: string[] = [];
  for (const part of parts) {
    const scoped = scopeSnippet(part.css, cardId);
    if (scoped.length > 0) {
      blocks.push(`/* ${labelFor(part.ref)} */\n${scoped}`);
    }
  }
  return blocks.join("\n");
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/snippet-scope.test.ts`
Expected: PASS，19 个用例。

三个补充点：

- `ROOT_PATTERN` 的 `i` 标志：CSS 伪类名是 ASCII 大小写不敏感的，`:ROOT` 是合法写法。之前没有 `i`，`:ROOT` 不会被改写，进了 `@scope` 就匹配不到任何东西，变量静默失效——和刚修的"注释后 `:root` 不改写"是同一个失败模式。
- `labelFor`：标签是 `/* ref */` 形式插进样式表里的，而 `ref` 来自卡片元数据（Note 里手写的），不是受信常量。一个含 `*/` 的 ref 会提前闭合注释，把后面的内容变成**未作用域的顶层 CSS**，绕过本模块唯一的存在理由。`labelFor` 把非 `[\w:.-]` 字符换成 `_`。标签只用于 devtools 辨认来源，替换没有任何功能代价。
- `scopedStylesheet` 只在 `scopeSnippet` 返回非空时才输出标签，所以今天这条路要先有一个能解析出真实 CSS 的 ref（Task 7 才决定这条链路的白名单）才谈得上触发。仍然先堵上：这是"把插值数据写进注释前先转义"，不是为不可能的场景加防御。

`ROOT_PATTERN` 的前缀字符类里那个 `\*\/` 是必需的，不是凑数：`@scope` 内部的 `:root` 指向文档根，不在作用域里，匹配不到任何元素，所以片段里的 `:root { --x: 1 }` 必须被改写成 `:scope`，否则变量根本没定义、依赖它的样式全部静默失效。而片段开头写一行注释（`/* 卡片配色 */`）是最常见的 CSS 习惯，此时 `:root` 前面是 `*/` 而不是 `^`/`{`/`}`/`;`/`,`——不加这个分支就完全不会改写。加 `\*\/` 之后，声明值里的 `":root"` 仍然不受影响（它前面是引号），对应测试钉的就是这个边界。

- [ ] **Step 5: 提交**

```bash
git add src/snippet-scope.ts tests/snippet-scope.test.ts
git commit -m "feat: 用 @scope 把 CSS 片段隔离到单张卡片"
```

---

### Task 7: 内置片段与片段仓库

**Files:**
- Create: `src/builtin-snippets/text.css`, `code.css`, `base.css`, `query.css`, `dataview.css`
- Create: `src/snippets.ts`
- Create: `vitest.config.ts`
- Test: `tests/snippet-registry.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `SnippetInfo`、`BUILTIN_SNIPPETS: Record<string, string>`、`parseSnippetRef(ref: string): { source: "builtin" | "user"; name: string } | null`、`class SnippetRegistry { constructor(app: App); list(): SnippetInfo[]; ensureUserNames(): Promise<void>; read(ref: string): Promise<string | null>; resolveAll(refs: string[]): Promise<{ ref: string; css: string }[]>; invalidate(): void }`

- [ ] **Step 1: 写五个内置片段**

`src/builtin-snippets/text.css`：

```css
/* 卡片内普通 Markdown 排版收敛 */
.home-card-content.markdown-rendered > :first-child {
  margin-top: 0;
}

.home-card-content.markdown-rendered > :last-child {
  margin-bottom: 0;
}

.home-card-content.markdown-rendered p {
  margin-block: 0.4em;
}

.home-card-content.markdown-rendered h1,
.home-card-content.markdown-rendered h2,
.home-card-content.markdown-rendered h3,
.home-card-content.markdown-rendered h4 {
  margin-block: 0.6em 0.35em;
  font-size: 1.15em;
}

.home-card-content.markdown-rendered ul,
.home-card-content.markdown-rendered ol {
  padding-inline-start: 1.3em;
  margin-block: 0.3em;
}

.home-card-content.markdown-rendered table {
  border-collapse: collapse;
  font-size: var(--font-ui-small);
}

.home-card-content.markdown-rendered th,
.home-card-content.markdown-rendered td {
  padding: 0.3em 0.6em;
}
```

**必须是 `.home-card-content.markdown-rendered`（同元素复合），不能写成 `.home-card-content .markdown-rendered`（后代）。** Task 10 的 `card.ts` 是把两个类加在**同一个**元素上的：

```ts
const content = this.el.createDiv({ cls: "home-card-content" });
content.addClass("markdown-rendered");
```

写成后代选择器会去找一个带 `markdown-rendered` 的**子元素**，而它永远不存在——整份 `text.css` 与 `code.css` 会变成死规则。后果不小：`css=auto` 永远包含 `builtin:text`，也就是最常用的内置片段完全不生效，代码块也拿不到限高与等宽。`base.css`/`query.css`/`dataview.css` 不受影响，因为它们瞄准的是 `.home-card-content` 内部由 Obsidian 真正发出的类。

`src/builtin-snippets/code.css`：

```css
/* 代码块限高内滚，代码统一等宽 */
.home-card-content.markdown-rendered pre {
  max-height: 22em;
  overflow: auto;
}

.home-card-content.markdown-rendered pre > code {
  font-family: var(--font-monospace);
  font-size: var(--font-ui-smaller);
}

.home-card-content.markdown-rendered :not(pre) > code {
  font-family: var(--font-monospace);
  font-size: 0.9em;
}
```

`src/builtin-snippets/base.css`：

```css
/* Bases 块嵌在卡片里时收紧并限高。选择器取自 obsidian.asar 实测 */
.home-card-content .block-language-base,
.home-card-content .bases-embed {
  margin-block: 0.4em;
}

.home-card-content .bases-view {
  max-height: 24em;
  overflow: auto;
}

.home-card-content .bases-table-container {
  font-size: var(--font-ui-small);
}

.home-card-content .bases-thead {
  position: sticky;
  top: 0;
  background-color: var(--background-primary);
}

.home-card-content .bases-toolbar {
  opacity: 0.55;
  font-size: var(--font-ui-smaller);
}

.home-card-content .bases-toolbar:hover {
  opacity: 1;
}
```

`src/builtin-snippets/query.css`：

```css
/* Obsidian 内置 ```query 块。注意：Obsidian 从不发出 .block-language-query，
   样式必须打在内部类上 */
.home-card-content .internal-query-header {
  font-size: var(--font-ui-small);
  opacity: 0.7;
  margin-bottom: 0.3em;
}

.home-card-content .internal-query-header-icon {
  display: inline-flex;
  margin-right: 0.3em;
}

.home-card-content .search-result-container {
  max-height: 24em;
  overflow: auto;
  font-size: var(--font-ui-small);
}

.home-card-content .search-result-file-title,
.home-card-content .search-result-file-matches {
  font-size: var(--font-ui-smaller);
  opacity: 0.75;
}
```

`query.css` 里不要写 `.search-result-file-path`：在 `obsidian.asar` 里它的出现次数是 **0**，Obsidian 从不发出这个类。真实存在的是 `.search-result-file-title`（2 次）、`.search-result-file-matches`（3 次）、`.search-result-file-match`（11 次）。早先把 `-path` 记为"已核实"是错的——那个字符串来自 `.obsidian/plugins` 下第三方插件自己的 CSS，不是 Obsidian 本体。同理，`.block-language-query` 在本体里出现 0 次，这个文件的注释说的没错。

`src/builtin-snippets/dataview.css`：

```css
/* Dataview / DataviewJS。选择器取自 dataview 官方 styles.css，
   需在装上 dataview 后实测校准 */
.home-card-content .block-language-dataview,
.home-card-content .block-language-dataviewjs {
  max-height: 26em;
  overflow: auto;
}

.home-card-content .table-view-table {
  font-size: var(--font-ui-small);
  border-collapse: collapse;
}

.home-card-content .table-view-table > thead > tr > th {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: var(--background-primary);
}

.home-card-content .table-view-table > thead > tr > th,
.home-card-content .table-view-table > tbody > tr > td {
  padding: 0.25em 0.5em;
  vertical-align: top;
}

.home-card-content .dataview-result-list-ul {
  margin-block: 0.2em;
  padding-inline-start: 1.2em;
}

.home-card-content .dataview.task-list-item,
.home-card-content .dataview.task-list-basic-item {
  margin-block: 1px;
}

.home-card-content .dataview.inline-field-key,
.home-card-content .dataview.inline-field-value {
  font-size: 0.9em;
  border-radius: var(--radius-s);
}

.home-card-content div.dataview-error-box {
  min-height: 4em;
  border-width: 2px;
}
```

注意：这五个片段自己已经带了 `.home-card-content` 前缀，是为了让它们在没有被 `@scope` 包裹时（例如用户直接把它当全局片段启用）也只在卡片里生效，不会污染正文。它们仍然会经过 `@scope` 包裹，两层限制叠加是安全的。

- [ ] **Step 2: 写失败的测试**

`tests/snippet-registry.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { BUILTIN_SNIPPETS, parseSnippetRef, SnippetRegistry } from "../src/snippets";
import { BUILTIN_SNIPPET_NAMES } from "../src/auto-snippets";

/**
 * 取出样式表里所有选择器。按行取会漏掉逗号续行（`.a,\n.b {` 里的 `.a`），
 * 实测五个片段里共有 11 行这样的续行，`base.css` 的第一个选择器就是其中之一——
 * 漏掉它们会让下面的"每个选择器都限定在卡片内"断言出现盲区。
 */
function selectorsOf(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  const pattern = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    for (const part of (match[1] ?? "").split(",")) {
      const selector = part.trim().replace(/\s+/g, " ");
      if (selector.length > 0 && !selector.startsWith("@")) {
        found.push(selector);
      }
    }
  }
  return found;
}

describe("BUILTIN_SNIPPETS", () => {
  it("ships a stylesheet for every builtin name", () => {
    for (const name of BUILTIN_SNIPPET_NAMES) {
      expect(BUILTIN_SNIPPETS[name], `missing builtin snippet: ${name}`).toBeTruthy();
    }
  });

  it("keeps every builtin stylesheet free of @import", () => {
    for (const [name, css] of Object.entries(BUILTIN_SNIPPETS)) {
      expect(css.includes("@import"), `${name} must not @import`).toBe(false);
    }
  });

  it("targets classes that actually exist in Obsidian", () => {
    expect(BUILTIN_SNIPPETS["base"]).toContain(".bases-view");
    expect(BUILTIN_SNIPPETS["query"]).toContain(".search-result-container");
    expect(BUILTIN_SNIPPETS["dataview"]).toContain(".table-view-table");
    expect(BUILTIN_SNIPPETS["text"]).toContain(".markdown-rendered");
  });

  it("never styles .block-language-query, which Obsidian does not emit", () => {
    // 只在选择器上断言：query.css 的注释里正当地提到了这个类名（就是为了说明它不存在），
    // 对整段 CSS 文本做子串匹配会把那句警告本身判成违规。
    for (const selector of selectorsOf(BUILTIN_SNIPPETS["query"] ?? "")) {
      expect(selector, `query must not style ${selector}`).not.toContain(".block-language-query");
    }
  });

  it("never styles .search-result-file-path, which Obsidian does not emit", () => {
    for (const selector of selectorsOf(BUILTIN_SNIPPETS["query"] ?? "")) {
      expect(selector, `query must not style ${selector}`).not.toContain(".search-result-file-path");
    }
  });

  it("scopes every rule to the card content container", () => {
    for (const [name, css] of Object.entries(BUILTIN_SNIPPETS)) {
      const selectors = selectorsOf(css);
      expect(selectors.length, `${name} produced no selectors`).toBeGreaterThan(0);
      for (const selector of selectors) {
        expect(selector, `${name} leaks outside the card: ${selector}`).toContain(
          ".home-card-content",
        );
      }
    }
  });

  it("never treats markdown-rendered as a descendant, since it sits on the container itself", () => {
    // card.ts 把 home-card-content 与 markdown-rendered 加在同一个元素上，
    // 所以 `.home-card-content .markdown-rendered` 去找的是不存在的子元素——整条规则是死的。
    for (const [name, css] of Object.entries(BUILTIN_SNIPPETS)) {
      for (const selector of selectorsOf(css)) {
        expect(selector, `${name} has a dead selector: ${selector}`).not.toContain(
          ".home-card-content .markdown-rendered",
        );
      }
    }
  });
});

describe("parseSnippetRef", () => {
  it("parses both sources", () => {
    expect(parseSnippetRef("builtin:base")).toEqual({ source: "builtin", name: "base" });
    expect(parseSnippetRef("user:my-card")).toEqual({ source: "user", name: "my-card" });
  });

  it("treats a bare name as builtin", () => {
    expect(parseSnippetRef("base")).toEqual({ source: "builtin", name: "base" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSnippetRef("  user:mine  ")).toEqual({ source: "user", name: "mine" });
  });

  it("rejects empty or malformed references", () => {
    expect(parseSnippetRef("")).toBeNull();
    expect(parseSnippetRef("   ")).toBeNull();
    expect(parseSnippetRef("user:")).toBeNull();
    expect(parseSnippetRef("builtin:")).toBeNull();
    expect(parseSnippetRef("other:mine")).toBeNull();
  });
});

describe("SnippetRegistry.read", () => {
  // `builtin:` 的读取不碰 adapter，所以这里可以只喂一个最小 stub。
  const registry = () =>
    new SnippetRegistry({ vault: { configDir: ".vault-config" } } as unknown as App);

  it("does not resolve inherited object properties as builtin snippets", async () => {
    const snippets = registry();
    await expect(snippets.read("builtin:constructor")).resolves.toBeNull();
    await expect(snippets.read("builtin:toString")).resolves.toBeNull();
    await expect(snippets.read("builtin:hasOwnProperty")).resolves.toBeNull();
    await expect(snippets.read("builtin:base")).resolves.toContain(".bases-view");
  });

  it("refuses a user reference that would escape the snippets directory", async () => {
    const requested: string[] = [];
    const app = {
      vault: {
        configDir: ".vault-config",
        adapter: {
          stat: (path: string) => {
            requested.push(path);
            return Promise.resolve({ mtime: 0 });
          },
          read: (path: string) => {
            requested.push(path);
            return Promise.resolve("LEAK");
          },
        },
      },
    } as unknown as App;

    const snippets = new SnippetRegistry(app);
    await expect(snippets.read("user:../../secret")).resolves.toBeNull();
    await expect(snippets.read("user:sub/name")).resolves.toBeNull();
    await expect(snippets.read("user:..")).resolves.toBeNull();
    // 关键断言：守卫拦下时根本不该去碰 adapter。
    expect(requested).toEqual([]);
  });
});
```

两个测试的写法有讲究：

- 第二个测试**必须挂一个会记录路径的 adapter**，否则它是一片装饰。只用 `{ vault: { configDir } }` 这种最小 stub 时，没有 adapter 会让 `stat` 直接抛进 `catch`，返回值同样是 `null`——把守卫整段删掉测试依然全绿，起不到任何作用。`requested` 为空数组这一条才是真正在钉"守卫在碰到文件系统之前就返回了"。
- stub 里用 `.vault-config` 而不是 `.obsidian`：`obsidianmd/hardcoded-config-path` 规则会拦下硬编码的配置目录名，而 `--max-warnings 0` 下这是失败。生产代码用的是 `this.app.vault.configDir`，本来就正确，只有测试 stub 需要注意。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/snippet-registry.test.ts`
Expected: FAIL — 无法解析 `../src/snippets`。

- [ ] **Step 4: 写实现**

`src/snippets.ts`：
```ts
import type { App } from "obsidian";
import baseCss from "./builtin-snippets/base.css";
import codeCss from "./builtin-snippets/code.css";
import dataviewCss from "./builtin-snippets/dataview.css";
import queryCss from "./builtin-snippets/query.css";
import textCss from "./builtin-snippets/text.css";

export interface SnippetInfo {
  ref: string;
  name: string;
  source: "builtin" | "user";
  path: string | null;
}

export const BUILTIN_SNIPPETS: Record<string, string> = {
  base: baseCss,
  code: codeCss,
  dataview: dataviewCss,
  query: queryCss,
  text: textCss,
};

export function parseSnippetRef(ref: string): { source: "builtin" | "user"; name: string } | null {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const separator = trimmed.indexOf(":");
  if (separator < 0) {
    return { source: "builtin", name: trimmed };
  }
  const source = trimmed.slice(0, separator).trim();
  const name = trimmed.slice(separator + 1).trim();
  if (name.length === 0) {
    return null;
  }
  if (source === "builtin") {
    return { source: "builtin", name };
  }
  if (source === "user") {
    return { source: "user", name };
  }
  return null;
}

interface CacheEntry {
  mtime: number;
  css: string;
}

/** 片段名会被拼进文件路径，拒绝分隔符与上级引用，避免 `user:../../x` 读到 snippets 目录之外 */
function isSafeSnippetName(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

export class SnippetRegistry {
  private readonly app: App;
  private userNames: string[] | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(app: App) {
    this.app = app;
  }

  get directory(): string {
    return `${this.app.vault.configDir}/snippets`;
  }

  list(): SnippetInfo[] {
    const builtin: SnippetInfo[] = Object.keys(BUILTIN_SNIPPETS)
      .sort()
      .map((name) => ({ ref: `builtin:${name}`, name, source: "builtin" as const, path: null }));
    const user: SnippetInfo[] = (this.userNames ?? [])
      .slice()
      .sort()
      .map((name) => ({
        ref: `user:${name}`,
        name,
        source: "user" as const,
        path: `${this.directory}/${name}.css`,
      }));
    return [...builtin, ...user];
  }

  invalidate(): void {
    this.userNames = null;
    this.cache.clear();
  }

  async ensureUserNames(): Promise<void> {
    if (this.userNames !== null) {
      return;
    }
    try {
      const listing = await this.app.vault.adapter.list(this.directory);
      this.userNames = listing.files
        .filter((file) => file.toLowerCase().endsWith(".css"))
        .map((file) => file.slice(file.lastIndexOf("/") + 1, -4));
    } catch {
      this.userNames = [];
    }
  }

  async read(ref: string): Promise<string | null> {
    const parsed = parseSnippetRef(ref);
    if (!parsed) {
      return null;
    }
    if (parsed.source === "builtin") {
      return Object.hasOwn(BUILTIN_SNIPPETS, parsed.name)
        ? (BUILTIN_SNIPPETS[parsed.name] ?? null)
        : null;
    }
    if (!isSafeSnippetName(parsed.name)) {
      return null;
    }
    const path = `${this.directory}/${parsed.name}.css`;
    try {
      const stat = await this.app.vault.adapter.stat(path);
      const mtime = stat?.mtime ?? 0;
      const cached = this.cache.get(path);
      if (cached && cached.mtime === mtime) {
        return cached.css;
      }
      const css = await this.app.vault.adapter.read(path);
      this.cache.set(path, { mtime, css });
      return css;
    } catch {
      return null;
    }
  }

  async resolveAll(refs: string[]): Promise<{ ref: string; css: string }[]> {
    const resolved: { ref: string; css: string }[] = [];
    for (const ref of refs) {
      resolved.push({ ref, css: (await this.read(ref)) ?? "" });
    }
    return resolved;
  }
}
```

- [ ] **Step 5: 运行测试，预期会失败在 CSS 导入上**

Run: `npx vitest run tests/snippet-registry.test.ts`
Expected: FAIL，但**不是**解析错误——`tests/snippet-registry.test.ts` 里 `BUILTIN_SNIPPETS[name]` 会断言失败（`undefined`）。

原因是构建与测试用的不是同一套打包器：`esbuild.config.mjs` 里配的 `.css` text loader 只作用于构建产物；而测试跑在 vitest 下，也就是跑在 Vite 下，Vite 默认不把 `.css` 当文本，`import baseCss from "./builtin-snippets/base.css"` 拿到的是空模块。`dist/main.js` 里内联的 CSS 是对的，但测试看不到。

- [ ] **Step 6: 加 vitest 配置，把 `.css` 当文本**

`vitest.config.ts`：

```ts
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * 构建与测试用的不是同一套打包器：esbuild.config.mjs 里配的 `.css` text loader
 * 只作用于构建产物，而 vitest 跑在 Vite 下，Vite 默认不把 `.css` 当文本。
 *
 * 更麻烦的是，vitest 自己有两个内置插件专门把 `.css` 变成空模块
 * （`test.css` 默认为 false）：
 *   - "vitest:css-disable"    enforce "pre"  返回 { code: "" }
 *   - "vitest:css-empty-post" enforce "post" 返回 `export default ""`
 * 它们分别守在 pre / post 两端，且都按 id 的扩展名判断，所以用户插件无论设成哪个
 * enforce 都会被覆盖。
 *
 * 因此这里不靠 enforce 抢顺序，而是在 resolveId 阶段把 `*.css` 换成不以 `.css`
 * 结尾的虚拟 id。cssLangRE 不再命中之后，上述两个内置插件与 vite:css 都会跳过，
 * 只剩下面的 load 把文件原文当纯文本导出。src/snippets.ts 的 import 保持原样，
 * esbuild 侧的 ".css": "text" loader 也不受影响。
 */
const VIRTUAL_PREFIX = "\0card-home-tab-css-text:";
const VIRTUAL_SUFFIX = "!raw";

export default defineConfig({
  plugins: [
    {
      name: "card-home-tab-css-as-text",
      enforce: "pre",
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith(".css") || importer === undefined) {
          return null;
        }
        const absolute = isAbsolute(source) ? source : resolve(dirname(importer), source);
        return `${VIRTUAL_PREFIX}${absolute}${VIRTUAL_SUFFIX}`;
      },
      load(id: string) {
        if (!id.startsWith(VIRTUAL_PREFIX) || !id.endsWith(VIRTUAL_SUFFIX)) {
          return null;
        }
        const file = id.slice(VIRTUAL_PREFIX.length, -VIRTUAL_SUFFIX.length);
        return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
      },
    },
  ],
});
```

**不要用更直觉的 `transform` + `enforce: "pre"` 版本**——它在 vitest 5 上是失效的：实测输出与不加配置时逐字节相同（`BUILTIN_SNIPPETS[name]` 仍然是 `''`），因为 vitest 的 `vitest:css-disable`（pre）与 `vitest:css-empty-post`（post）按扩展名两头夹击，用户插件的 `enforce` 抢不到。`test.css: true` 也不行，会换成 `vite:css` 接管、结果是 `undefined`。虚拟 id 绕开的是"按 `.css` 扩展名判断"这个机制本身，所以它有效。

这个文件不参与 `tsc --noEmit`（`tsconfig.json` 的 `include` 只覆盖 `src/**` 与 `tests/**`），也不参与 `eslint`（脚本只扫 `src tests`），所以不需要额外的类型或 lint 配置。

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/snippet-registry.test.ts`
Expected: PASS，12 个用例。

`base.css` 里**不要**给 `.bases-thead` 写 `z-index`。Obsidian 自己已经给了 `.bases-thead { position: sticky; top: 0; z-index: var(--layer-cover); … }`，而片段的 specificity 是 `(0,2,0)`、高于 `.bases-thead` 的 `(0,1,0)`（`@scope` 的邻近性是在 specificity 之后才比较的，救不回来），所以照抄一个 `1` 只会把层级**调低**——同一层叠上下文里任何 `z-index` 落在 `(1, 100]` 的元素（Base 自己的筛选浮层之类）都会盖到吸顶表头上。`position`/`top` 保留（自给自足，不依赖 Obsidian 实现），层级交回给 Obsidian。

`read()` 里两处守卫都不是防御性冗余：

- **`Object.hasOwn`**：`BUILTIN_SNIPPETS` 是对象字面量，`BUILTIN_SNIPPETS["constructor"] ?? null` 会返回**函数**——`constructor`/`toString`/`hasOwnProperty`/`valueOf` 都从原型链上捞得到，`__proto__` 还会返回对象。它们全都不是 `null`，所以 `?? null` 拦不住，函数会一路流到 Task 10，在那里被当成字符串调用 `.split()` 而抛 `TypeError`——正好违背"解析不到的引用要静默降级"这条契约。
- **`isSafeSnippetName`**：`parsed.name` 来自卡片元数据（Note 里手写的），会被直接拼进文件路径。`user:../../foo` 会变成 `.obsidian/snippets/../foo.css`，链条更长时能读到自己 vault 之外的文件。影响上限是"只读、且只限 `.css`"——读不到笔记正文，写不了任何东西，也没有外泄通道（CSS 无法把文件内容读进 URL）——但既然 Task 10 会把卡片里的引用喂进来，就该在这里堵住。

- [ ] **Step 8: 跑通完整检查并提交**

Run: `npm run check`
Expected: 全绿。

还要确认 esbuild 侧的 text loader 仍然生效。**不要**去 grep `dist/main.js`：此时 `src/main.ts` 还是 Task 1 留下的空壳，`treeShaking` 会把没人引用的 `src/snippets.ts` 整块丢掉，`grep -c` 会得到 0，看起来像 loader 坏了。要等 Task 10 把片段渲染接到视图上之后，`dist/main.js` 里才会出现内置片段的内容。现在按下面的方式单独打包这个模块来验证：

```bash
npx esbuild src/snippets.ts --bundle --format=cjs --platform=browser \
  --loader:.css=text --external:obsidian \
  --outfile=.superpowers/sdd/snippets-probe.js
grep -c "home-card-content" .superpowers/sdd/snippets-probe.js
```

Expected: 大于 0（每个片段文件里的 `.home-card-content` 选择器都会被内联进产物）。

`.superpowers/sdd/` 是自忽略的临时目录，产物不会被提交。

```bash
git add src/snippets.ts src/builtin-snippets tests/snippet-registry.test.ts vitest.config.ts
git commit -m "feat: 五个按内容类型分组的内置片段与片段仓库"
```

---

### Task 8: 仪表盘文件读写

**Files:**
- Create: `src/vault-path.ts`
- Create: `src/dashboard/io.ts`
- Test: `tests/vault-path.test.ts`

**Interfaces:**
- Consumes: `CardHomeTabSettings`（Task 1）；`parseDashboard`、`CardSection`（Task 3）
- Produces:
  - `normalizeVaultPath(raw: string): string`
  - `class DashboardStore { constructor(app: App, getSettings: () => CardHomeTabSettings); get path(): string; get file(): TFile | null; exists(): boolean; create(): Promise<void>; read(): Promise<string | null>; sections(): Promise<CardSection[]>; process(mutate: (text: string) => string): Promise<void> }`

`src/vault-path.ts` 是纯函数、不引入 Obsidian，因此可以单测；`src/dashboard/io.ts` 依赖 Vault，按设计文档的测试策略不写单测，由 Task 9 的手工验收覆盖。**注意 `obsidian` 包只有类型、没有运行时 JS**，所以任何单测都不能间接导入 `io.ts`（它有 `TFile` 的 value import）——这正是把规范化逻辑单独拆出来的另一个原因。

- [ ] **Step 1: 写失败的测试**

`tests/vault-path.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { normalizeVaultPath } from "../src/vault-path";

describe("normalizeVaultPath", () => {
  it("leaves an ordinary path alone", () => {
    expect(normalizeVaultPath("Home.md")).toBe("Home.md");
    expect(normalizeVaultPath("子目录/Home.md")).toBe("子目录/Home.md");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeVaultPath("  Home.md  ")).toBe("Home.md");
  });

  it("strips leading slashes and dot segments", () => {
    expect(normalizeVaultPath("/Home.md")).toBe("Home.md");
    expect(normalizeVaultPath("./Home.md")).toBe("Home.md");
    expect(normalizeVaultPath(".//Home.md")).toBe("Home.md");
  });

  it("collapses repeated and trailing separators", () => {
    expect(normalizeVaultPath("a//b///Home.md")).toBe("a/b/Home.md");
    expect(normalizeVaultPath("a/b/")).toBe("a/b");
  });

  it("accepts windows separators", () => {
    expect(normalizeVaultPath("子目录\\Home.md")).toBe("子目录/Home.md");
    expect(normalizeVaultPath(".\\Home.md")).toBe("Home.md");
  });

  it("resolves parent references", () => {
    expect(normalizeVaultPath("a/b/../Home.md")).toBe("a/Home.md");
    expect(normalizeVaultPath("a/../../Home.md")).toBe("Home.md");
  });

  it("returns an empty string for input that resolves to nothing", () => {
    expect(normalizeVaultPath("")).toBe("");
    expect(normalizeVaultPath("   ")).toBe("");
    expect(normalizeVaultPath("/")).toBe("");
    expect(normalizeVaultPath(".")).toBe("");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/vault-path.test.ts`
Expected: FAIL — 无法解析 `../src/vault-path`。

- [ ] **Step 3: 写实现**

`src/vault-path.ts`：

```ts
/**
 * 把用户填的路径整理成 Obsidian 的库内路径形式。
 *
 * `getAbstractFileByPath` 是精确匹配，而 `Vault.create` 会把路径规范化后再落盘。
 * 两者不一致时会出现很难查的现象：用户填了 `./Home.md`，`exists()` 永远为 false，
 * 首页一直显示"文件缺失"，点"创建并打开"也修不好——因为文件其实已经被创建成
 * `Home.md` 了。所以这里在进入 store 之前就把路径统一掉。
 */
export function normalizeVaultPath(raw: string): string {
  const unified = raw.trim().replace(/\\/g, "/");
  const segments: string[] = [];
  for (const segment of unified.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/vault-path.test.ts`
Expected: PASS，7 个用例。

- [ ] **Step 5: 写 store**

`src/dashboard/io.ts`：

```ts
import { TFile, type App, type Vault } from "obsidian";
import type { CardHomeTabSettings } from "../settings";
import { normalizeVaultPath } from "../vault-path";
import { parseDashboard, type CardSection } from "./parse";

const FALLBACK_PATH = "Home.md";

export class DashboardStore {
  private readonly app: App;
  private readonly getSettings: () => CardHomeTabSettings;

  constructor(app: App, getSettings: () => CardHomeTabSettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  get path(): string {
    return normalizeVaultPath(this.getSettings().dashboardFile) || FALLBACK_PATH;
  }

  get file(): TFile | null {
    const found = this.app.vault.getAbstractFileByPath(this.path);
    return found instanceof TFile ? found : null;
  }

  private get vault(): Vault {
    return this.app.vault;
  }

  exists(): boolean {
    return this.file !== null;
  }

  async create(): Promise<void> {
    if (this.exists()) {
      return;
    }
    const path = this.path;
    const separator = path.lastIndexOf("/");
    if (separator > 0) {
      const folder = path.slice(0, separator);
      if (!this.vault.getAbstractFileByPath(folder)) {
        try {
          await this.vault.createFolder(folder);
        } catch {
          // 文件夹可能已被并发创建，忽略
        }
      }
    }
    await this.vault.create(path, "");
  }

  async read(): Promise<string | null> {
    const file = this.file;
    if (!file) {
      return null;
    }
    return this.vault.cachedRead(file);
  }

  async sections(): Promise<CardSection[]> {
    const text = await this.read();
    if (text === null) {
      return [];
    }
    return parseDashboard(text, this.getSettings().cardHeadingLevel);
  }

  async process(mutate: (text: string) => string): Promise<void> {
    const file = this.file;
    if (!file) {
      throw new Error(`CardHomeTab: dashboard file not found: ${this.path}`);
    }
    await this.vault.process(file, mutate);
  }
}
```

`path` 会兜底成 `Home.md`：设置项可以被清空，而仪表盘总得指向某个东西。`create()` 容忍文件夹已存在（并发创建或用户手建），但不能吞掉随后 `create` 的失败。`process()` 是唯一会抛的方法——文件不存在时写入属于调用方的编程错误，调用方应先 `create()`。

- [ ] **Step 6: 类型检查与全量检查**

Run: `npm run check`
Expected: 全绿。

`src/dashboard/io.ts` 此时还没有被任何模块引用（`src/main.ts` 仍是 Task 1 的空壳），所以 esbuild 的 tree-shaking 不会把它打进 `dist/main.js`——这是预期的，Task 9 才把它接上。

- [ ] **Step 7: 提交**

```bash
git add src/vault-path.ts src/dashboard/io.ts tests/vault-path.test.ts
git commit -m "feat: 仪表盘文件的原子读写与创建"
```

---

### Task 9: 插件入口与首页视图骨架

**Files:**
- Create: `src/home-view.ts`
- Modify: `src/main.ts`（替换 Task 1 的最小实现）
- Modify: `styles.css`
- Test: 手工验收（Obsidian 内）

**Interfaces:**
- Consumes: `mergeSettings`、`CardHomeTabSettings`（Task 1）；`DashboardStore`（Task 8）
- Produces: `HOME_VIEW_TYPE = "card-home-tab-view"`、`class HomeView extends ItemView { constructor(leaf: WorkspaceLeaf, plugin: CardHomeTabPlugin); render(): Promise<void> }`、`class CardHomeTabPlugin { settings: CardHomeTabSettings; store: DashboardStore; async saveSettings(): Promise<void>; async openHome(): Promise<void>; async openDashboardNote(): Promise<void>; refreshHome(): void; async markSelfWriting<T>(action: () => Promise<T>): Promise<T> }`
- [ ] **Step 1: 写首页视图**

`src/home-view.ts`：

```ts
import { ItemView, type WorkspaceLeaf } from "obsidian";
import type CardHomeTabPlugin from "./main";

export const HOME_VIEW_TYPE = "card-home-tab-view";

export class HomeView extends ItemView {
  private readonly plugin: CardHomeTabPlugin;
  private rootEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CardHomeTabPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return HOME_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "卡片首页";
  }

  getIcon(): string {
    return "lucide-layout-dashboard";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("home-tab-view-content");
    this.rootEl = this.contentEl.createDiv({ cls: "home-tab-root" });
    await this.render();
  }

  async onClose(): Promise<void> {
    this.rootEl = null;
    this.contentEl.empty();
  }

  async render(): Promise<void> {
    const root = this.rootEl;
    if (!root) {
      return;
    }
    root.empty();
    if (!this.plugin.store.exists()) {
      this.renderMissingFile(root);
      return;
    }
    root.createDiv({ cls: "home-tab-placeholder", text: "卡片区域将在 Task 10 接入" });
  }

  private renderMissingFile(root: HTMLElement): void {
    const notice = root.createDiv({ cls: "home-tab-missing" });
    notice.createEl("p", { text: `没有找到仪表盘文件：${this.plugin.store.path}` });
    const button = notice.createEl("button", { text: "创建并打开" });
    button.addEventListener("click", () => {
      void (async () => {
        await this.plugin.store.create();
        await this.plugin.openDashboardNote();
        await this.render();
      })();
    });
  }
}
```

- [ ] **Step 2: 写插件入口**

`src/main.ts`：

```ts
import { Plugin } from "obsidian";
import { DashboardStore } from "./dashboard/io";
import { HOME_VIEW_TYPE, HomeView } from "./home-view";
import { DEFAULT_SETTINGS, mergeSettings, type CardHomeTabSettings } from "./settings";

export default class CardHomeTabPlugin extends Plugin {
  settings: CardHomeTabSettings = { ...DEFAULT_SETTINGS, recentFiles: [] };
  store!: DashboardStore;

  private selfWriting = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new DashboardStore(this.app, () => this.settings);

    this.registerView(HOME_VIEW_TYPE, (leaf) => new HomeView(leaf, this));

    this.addCommand({
      id: "open-home",
      name: "打开首页",
      callback: () => {
        void this.openHome();
      },
    });

    this.addCommand({
      id: "refresh-cards",
      name: "刷新所有卡片",
      callback: () => {
        this.refreshHome();
      },
    });

    this.addCommand({
      id: "open-dashboard-note",
      name: "在标签页打开仪表盘",
      callback: () => {
        void this.openDashboardNote();
      },
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.maybeReplaceEmptyLeaf();
      }),
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.selfWriting || file.path !== this.store.path) {
          return;
        }
        this.refreshHome();
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openOnStartup) {
        void this.openHome();
      }
    });
  }

  async openHome(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
  }

  async openDashboardNote(): Promise<void> {
    if (!this.store.exists()) {
      await this.store.create();
    }
    await this.app.workspace.openLinkText(this.store.path, "", false);
  }

  refreshHome(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE)) {
      if (leaf.view instanceof HomeView) {
        void leaf.view.render();
      }
    }
  }

  async markSelfWriting<T>(action: () => Promise<T>): Promise<T> {
    this.selfWriting = true;
    try {
      return await action();
    } finally {
      window.setTimeout(() => {
        this.selfWriting = false;
      }, 350);
    }
  }

  private maybeReplaceEmptyLeaf(): void {
    if (!this.settings.replaceNewTabs) {
      return;
    }
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf || leaf.view.getViewType() !== "empty") {
      return;
    }
    void leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

`maybeReplaceEmptyLeaf` 依赖 Obsidian 空标签页的视图类型字符串 `"empty"`。这不是公开 API 文档里明确写的常量，Step 4 的手工验收里有一项专门确认它：打开一个新标签页，在控制台执行 `app.workspace.getMostRecentLeaf().view.getViewType()`，**把真实返回值写进代码**，不要凭猜测保留 `"empty"`。如果真实值不同，同步改掉两处比较。

**实施记录（计划外但已落地，后续任务不要重复添加）**：实际实现比上面的代码块多出这些内容，原因是它们在本任务就有存在理由——

- `getDisplayText()` 返回 `"卡片首页"`（中文，见 Global Constraints 里的 UI 文案约定）。
- `snippets!: SnippetRegistry` 字段。片段仓库本身是 Task 7 的产物，但视图骨架之后要靠它渲染卡片样式，提前挂上比 Task 10 再回头改 `onload` 更省事。
- `editCard` / `addCard` / `removeCard` / `openCardSettings` 四个方法，以及 `new-card` 命令。计划原本把它们放在 Task 10，但本任务已经有了"仪表盘文件缺失"提示与 `process()` 失败路径，这两处都需要写文件的入口，提前落地能让失败的调用链完整可测。`openCardSettings` 此时只是弹一个占位 Notice，Task 14 替换。
- `removeCard` / `addCard` 里对 `store.process()` 的 `await` 都包在 `try/catch` 中并弹 `Notice`：`process()` 是唯一会抛的方法，而 Obsidian 里未处理的 rejection 只会留在控制台（见进度记录第 36 条）。
- `editCard` 要按**模式**判断，而不是按 `view.editor` 是否存在。设计意图是"光标与视口定位到该 section 的标题行"，而阅读视图下没有可编辑光标，所以必须先切到源码模式。不要写成 `if (!view.editor)`：`MarkdownView.editor` 在公开类型声明里是**非可选**的（`editor: Editor;`），而且在 `obsidian.asar` 里本体的标签页 `MarkdownView` 用的 getter 是 `get:function(){return this.editMode.editor}`——**没有**空值保护，`editMode` 与 `editMode.editor` 都在视图构造时就建好了。那个带 `?` 的空安全 getter（`editMode?.editor`）属于**内嵌/行内**的 markdown 编辑组件，不是 `getActiveViewOfType(MarkdownView)` 能拿到的那个类。所以 `!view.editor` 永远为假，是一段死代码，而且真正的问题（光标落在隐藏的编辑器上、用户什么都看不到）依然存在。正确判据是 `view.getMode() === "preview"`。
- `editCard` 必须在内部把异常收干净（`try/catch` + `Notice`），不能让它 reject。Task 10 的调用点写的是 `onEdit: (target) => void this.plugin.editCard(target)`，`void` 会把 rejection 丢掉，只剩控制台里一条未处理拒绝。`openLinkText` 与 `setState` 都可能失败，所以"内部兜住"比"让每个调用点都 `catch`"更可靠。

- [ ] **Step 3: 补样式**

`styles.css` 追加：

```css
.home-tab-view-content {
  padding: 0;
  overflow: auto;
}

.home-tab-root {
  min-height: 100%;
  padding: var(--size-4-6);
  display: flex;
  flex-direction: column;
  gap: var(--size-4-6);
}

.home-tab-missing {
  text-align: center;
  color: var(--text-muted);
}

.home-tab-missing button {
  margin-top: var(--size-4-2);
}
```

- [ ] **Step 4: 手工验收**

Run: `npm run build`，把 `dist/` 拷到 vault 的 `.obsidian/plugins/card-home-tab/`，在 Obsidian 里启用插件。

- 命令面板执行「打开首页」→ 出现首页视图。
- 命令面板执行「在标签页打开仪表盘」→ 打开 `Home.md`。
- 删掉 `Home.md` 再回首页 → 显示缺失提示，点「创建并打开」→ 文件被创建并打开。
- **测一个多级路径**：把 `dashboardFile` 改成 `子目录/更深/Home.md` 再回首页 → 点「创建并打开」应当把两级目录都建出来。`vault.createFolder` 的递归行为不在类型声明里写明，这一步就是确认它。若只建出一级并抛错，说明它不递归，需要改成逐级创建。
- **测 `process()` 的失败路径**：把 `Home.md` 删掉（不重开视图）后触发一次会写文件的操作，确认异常被 `await`/`catch` 住并弹出 Notice，而不是只在控制台留下未处理的 rejection。
- 打开一个新标签页，在控制台执行 `app.workspace.getMostRecentLeaf().view.getViewType()`，确认返回值。**如果返回值不是 `"empty"`，把 `maybeReplaceEmptyLeaf` 里的字符串换成真实值**，然后重新验证新标签页会自动变成首页。

- [ ] **Step 5: 提交**

```bash
git add src/main.ts src/home-view.ts styles.css
git commit -m "feat: 插件入口、首页视图骨架与仪表盘缺失提示"
```

---

### Task 10: 卡片渲染管线

**Files:**
- Create: `src/card.ts`
- Modify: `src/home-view.ts`, `src/main.ts`, `esbuild.config.mjs`, `styles.css`
- Test: 手工验收

**Interfaces:**
- Consumes: `CardSection`、`sectionBody`（Task 3）；`resolveSnippetRefs`（Task 5）；`scopedStylesheet`（Task 6）；`SnippetRegistry`（Task 7）
- Produces: `CardCallbacks`、`CardViewArgs`、`class CardView { constructor(args: CardViewArgs); readonly el: HTMLElement; applyStyles(css: string): void; render(body: string, css: string): Promise<void>; destroy(): void }`
- [ ] **Step 1: 写卡片视图（并先让 esbuild 输出 UTF-8）**

先改 `esbuild.config.mjs`：在 context 选项里加一行

```js
  charset: "utf8",
```

esbuild 默认 `charset: "ascii"`，会把所有非 ASCII 字符转义成 `\uXXXX`。功能上没错，但本项目 UI 文案是中文，默认行为会让 `dist/main.js` 里满屏 `\u5361\u7247\u9996\u9875`——读不了，而且后面几步"用 grep 确认某个字符串进了产物"的验收全部失效（实测 `grep -c "卡片首页" dist/main.js` 在没有这行时返回 0，加上才正常）。Obsidian 跑在 Chromium 上、`manifest.json` 与 `styles.css` 本来就是 UTF-8，所以指定 utf8 是安全的。

改完先确认一行：

Run: `npm run build && grep -c "卡片首页" dist/main.js`
Expected: 大于 0。

然后写卡片视图。

`src/card.ts`：

```ts
import { Component, MarkdownRenderer, setIcon, type App } from "obsidian";
import type { CardSection } from "./dashboard/parse";

/**
 * 卡片样式只能运行时注入（内容由用户片段文件与每卡 %%card:%% 元数据生成），
 * 没法放进静态的 styles.css；而 `obsidianmd/no-forbidden-elements` 明确禁止创建
 * `<style>` 元素。所以改用可构造样式表 + adoptedStyleSheets：不创建任何元素，
 * 符合规则的意图与字面。
 *
 * 平台下限不会因此抬高：卡片样式本身就依赖 `@scope`（Chromium 118+ / Safari 17.2+），
 * 而 adoptedStyleSheets 从 Chromium 73+ / Safari 16.4+ 就可用——凡是支持 `@scope` 的
 * 环境都支持它。这个探测仍然保留，作为老环境的降级开关：不支持时只跳过样式注入，
 * 卡片照常渲染，不抛异常。
 */
let styleSheetSupport: boolean | null = null;

function supportsConstructableStyleSheets(): boolean {
  if (styleSheetSupport !== null) {
    return styleSheetSupport;
  }
  styleSheetSupport =
    typeof CSSStyleSheet === "function" &&
    "adoptedStyleSheets" in Document.prototype &&
    "replaceSync" in CSSStyleSheet.prototype;
  return styleSheetSupport;
}

export interface CardCallbacks {
  onEdit(section: CardSection): void;
  onRemove(section: CardSection): void;
  onSettings(section: CardSection): void;
}

export interface CardViewArgs {
  app: App;
  section: CardSection;
  dashboardPath: string;
  cardId: string;
  callbacks: CardCallbacks;
}

export class CardView {
  readonly el: HTMLElement;
  readonly handleEl: HTMLElement;

  private readonly args: CardViewArgs;
  private readonly contentEl: HTMLElement;
  private sheet: CSSStyleSheet | null = null;
  private destroyed = false;  private component: Component | null = null;
  private renderToken = 0;

  constructor(args: CardViewArgs) {
    this.args = args;
    this.el = createDiv({ cls: "home-card" });
    this.el.dataset["cardId"] = args.cardId;

    const header = this.el.createDiv({ cls: "home-card-header" });
    if (args.section.meta.icon.length > 0) {
      setIcon(header.createSpan({ cls: "home-card-icon" }), args.section.meta.icon);
    }
    header.createSpan({ cls: "home-card-title", text: args.section.title });

    const actions = header.createDiv({ cls: "home-card-actions" });
    this.handleEl = actions.createSpan({ cls: "home-card-handle" });
    setIcon(this.handleEl, "lucide-grip-vertical");

    const settingsButton = actions.createSpan({ cls: "home-card-action" });
    setIcon(settingsButton, "lucide-settings-2");
    settingsButton.addEventListener("click", () => args.callbacks.onSettings(args.section));

    const editButton = actions.createSpan({ cls: "home-card-action" });
    setIcon(editButton, "lucide-pencil");
    editButton.addEventListener("click", () => args.callbacks.onEdit(args.section));

    const removeButton = actions.createSpan({ cls: "home-card-action" });
    setIcon(removeButton, "lucide-trash-2");
    removeButton.addEventListener("click", () => args.callbacks.onRemove(args.section));

    const content = this.el.createDiv({ cls: "home-card-content" });
    content.addClass("markdown-rendered");
    this.contentEl = content;

    if (args.section.meta.span > 1) {
      this.el.style.gridColumn = `span ${args.section.meta.span}`;
    }
  }

  applyStyles(css: string): void {
    if (this.destroyed) {
      return;
    }
    this.detachStyles();
    const trimmed = css.trim();
    if (trimmed.length === 0 || !supportsConstructableStyleSheets()) {
      return;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(trimmed);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    this.sheet = sheet;
  }

  private detachStyles(): void {
    const sheet = this.sheet;
    if (!sheet) {
      return;
    }
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet);
    this.sheet = null;
  }

  async render(body: string, css: string): Promise<void> {
    if (this.destroyed) {
      return;
    }
    const token = ++this.renderToken;
    this.component?.unload();
    this.component = null;
    this.contentEl.empty();
    this.applyStyles(css);

    const holder = this.contentEl.createDiv({ cls: "home-card-content-inner" });
    const component = new Component();
    component.load();
    this.component = component;

    await MarkdownRenderer.render(
      this.args.app,
      body,
      holder,
      this.args.dashboardPath,
      component,
    );

    if (token !== this.renderToken || this.destroyed) {
      if (this.component === component) {
        this.component = null;
      }
      component.unload();
      holder.remove();
      if (this.destroyed) {
        this.detachStyles();
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.renderToken++;
    this.component?.unload();
    this.component = null;
    this.detachStyles();
    this.el.remove();
  }
}
```

这里是本任务唯一容易写错的地方：每次渲染都新建自己的 `holder` 子元素并持有自己的 `Component`。并发渲染时，先发起的那次回来发现 token 已过期，就卸载自己的 Component 并删掉自己的 `holder`，不会污染后发起的那次的内容。

`destroyed` 标志位是必需的，不是冗余防御。`HomeView.render` 在 `cardViews.push(card)` 与 `grid.appendChild(card.el)` **之后**才 `await`，而它的令牌检查在每次循环的**开头**——所以存在这样一条交错：旧一次渲染建好卡片、挂上 DOM，然后停在 `await snippets.resolveAll(...)`；此时新一次渲染（或 `onClose`）跑 `disposeCards()` 把这张卡销毁；旧渲染恢复后继续调 `card.render(...)`，而 `destroy()` 已经把 `renderToken` 加过一，于是 `++this.renderToken` 让局部 token 等于新值、过期检查通过——结果是：已经脱离文档的容器被重新填充、一个新的 `Component` 被 load、并通过 `applyStyles` 往 `document.adoptedStyleSheets` 里再插一张表。这张卡已经不在 `cardViews` 里，之后任何 `disposeCards()` 都碰不到它，于是 Component、分离的 DOM 子树、以及那张全局样式表全部泄漏到会话结束。更麻烦的是 scope 根用的是 `card-${section.index}`，泄漏的那张表会和**同 id 的活卡片**抢规则，而且它加入得更晚、因此胜出——用户刚改掉某张卡的片段却看不到变化。

结尾的 `if (this.component === component)` 判断也不能省：并发渲染时 `this.component` 可能已经指向更新那个 Component，直接置 null 会让新渲染的 Component 失去引用而永远不被卸载。这同时消掉了"同一个 Component 被 `unload()` 两次"的问题（`Component.unload()` 不保证幂等，重复调用会让 MarkdownRenderer 的子组件再跑一遍 `onunload`）。

- [ ] **Step 2: 接进首页视图**

`render()` 现在会 `await` 多次（读文件、每张卡片都要 `MarkdownRenderer.render`），而它可能被并发调用——`markSelfWriting` 的 350ms 抑制窗口不保证一定能拦住自己写入引发的 `modify` 事件，晚到的那次 `modify` 会再触发一次 `refreshHome()`。两次 `render()` 交错会把卡片建两遍。所以必须先加一个递增令牌，任何一次 `render()` 在每次 `await` 之后都检查自己是否已被后来者取代，过期就直接放弃。

`src/home-view.ts` 的 `render()` 换成真正渲染卡片，并补上 `disposeCards`：

```ts
  private cardViews: CardView[] = [];
  private renderToken = 0;

  async render(): Promise<void> {
    const token = ++this.renderToken;
    const root = this.rootEl;
    if (!root) {
      return;
    }
    this.disposeCards();
    root.empty();
    if (!this.plugin.store.exists()) {
      this.renderMissingFile(root);
      return;
    }
    const text = await this.plugin.store.read();
    if (token !== this.renderToken) {
      return;
    }
    if (text === null) {
      this.renderMissingFile(root);
      return;
    }
    const sections = parseDashboard(text, this.plugin.settings.cardHeadingLevel);
    const grid = root.createDiv({ cls: "home-tab-cards" });
    grid.style.gridTemplateColumns = `repeat(${this.plugin.settings.gridColumns}, minmax(0, 1fr))`;

    for (const section of sections) {
      if (token !== this.renderToken) {
        return;
      }
      const body = sectionBody(text, section);
      const cardId = `card-${section.index}`;
      const card = new CardView({
        app: this.app,
        section,
        dashboardPath: this.plugin.store.path,
        cardId,
        callbacks: {
          onEdit: (target) => void this.plugin.editCard(target),
          onRemove: (target) => void this.plugin.removeCard(target),
          onSettings: (target) => this.plugin.openCardSettings(target),
        },
      });
      this.cardViews.push(card);
      grid.appendChild(card.el);

      const parts = await this.plugin.snippets.resolveAll(resolveSnippetRefs(section.meta, body));
      if (token !== this.renderToken) {
        return;
      }
      await card.render(body, scopedStylesheet(parts, cardId));
    }
  }

  private disposeCards(): void {
    for (const card of this.cardViews) {
      card.destroy();
    }
    this.cardViews = [];
  }
```

`renderToken` 的两个检查点都不能省：一次在 `await store.read()` 之后（读盘是异步的），一次在每张卡片开始渲染之前（`snippets.resolveAll` 要读用户片段文件、`MarkdownRenderer.render` 也是异步的）。漏掉第二个的话，一个过期的 `render()` 仍会把剩下的卡片追加进已经被新一次 `render()` 清空过的 `grid` 里。

需要它是因为 `markSelfWriting` 的抑制窗口不保证一定能拦住自己写入引发的事件（定时器从 `process()` resolve 之后才开始计时，而 Obsidian 的 `modify` 事件走异步派发）。晚到的那次 `modify` 会再触发一次 `refreshHome()`，于是两次 `render()` 并发——没有令牌就会把卡片建两遍。

`onClose` 里在清空之前先调 `this.disposeCards()`：

```ts
  async onClose(): Promise<void> {
    this.renderToken++;
    this.disposeCards();
    this.rootEl = null;
    this.contentEl.empty();
  }
```

`onClose` 里那个 `this.renderToken++` 不能省：`render()` 会在每张卡片之间 `await`，视图关闭时很可能还有一次渲染在途，它恢复后会把卡片追加进一个已经脱离文档的 `grid`。递增令牌让在途渲染在下一次检查点直接放弃。

`src/home-view.ts` 顶部需要新增的 import：

```ts
import { CardView } from "./card";
import { resolveSnippetRefs } from "./auto-snippets";
import { parseDashboard, sectionBody } from "./dashboard/parse";
import { scopedStylesheet } from "./snippet-scope";
```

- [ ] **Step 3: 在 main.ts 里接上卡片渲染所需的依赖**

**Task 9 已经加好了这些，本任务不要重复添加**：`snippets!: SnippetRegistry` 字段、`editCard` / `addCard` / `removeCard` / `openCardSettings` 四个方法、`new-card` 命令，以及 `removeCard` / `addCard` 里对 `store.process()` 的 `try/catch` + `Notice`。Task 9 的计划文本末尾有「实施记录」一节列了完整清单，先读它再动手，否则会重复定义同名成员。

本任务在 `home-view.ts` 里把它们当作已存在的接口使用：`this.plugin.snippets`、`this.plugin.editCard(...)`、`this.plugin.removeCard(...)`、`this.plugin.openCardSettings(...)`。若发现某个成员缺失，说明 Task 9 的实现与它的实施记录不一致——停下来告诉我，不要就地补一个。

`openCardSettings` 在 Task 9 里是弹占位 Notice 的，本任务不动它，Task 14 才替换成真正的弹窗。

- [ ] **Step 4: 补样式**

`styles.css` 追加：

```css
.home-tab-cards {
  display: grid;
  gap: var(--size-4-4);
  align-items: start;
}

@media (max-width: 900px) {
  .home-tab-cards {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}

.home-card {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background-color: var(--background-primary);
  padding: var(--size-4-3);
  overflow: hidden;
}

.home-card-header {
  display: flex;
  align-items: center;
  gap: var(--size-4-1);
  margin-bottom: var(--size-4-2);
}

.home-card-title {
  flex: 1;
  min-width: 0;
  font-weight: var(--font-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-card-icon {
  display: inline-flex;
  color: var(--text-muted);
}

.home-card-actions {
  display: flex;
  gap: var(--size-4-1);
  opacity: 0;
  transition: opacity 120ms ease-in-out;
}

.home-card:hover .home-card-actions,
.home-card:focus-within .home-card-actions {
  opacity: 1;
}

.home-card-action,
.home-card-handle {
  display: inline-flex;
  padding: var(--size-2-2);
  border-radius: var(--radius-s);
  color: var(--text-muted);
  cursor: pointer;
}

.home-card-handle {
  cursor: grab;
}

.home-card-action:hover {
  background-color: var(--background-modifier-hover);
  color: var(--text-normal);
}

.home-card-content-inner > :first-child {
  margin-top: 0;
}

.home-card-content-inner > :last-child {
  margin-bottom: 0;
}
```

- [ ] **Step 5: 手工验收**

用下面的内容覆盖 `Home.md`：

````markdown
# 首页

## 纯文本
这是一段普通文字，带 **加粗** 和 `行内代码`。

## 代码
```js
const a = 1;
```

## 查询
```query
path:"1-Projects"
```

## base
```base
```

## 带元数据
%%card: css=auto; span=2; icon=lucide-chart%%
同时有文字和查询：

```query
tag:#项目
```
````

- 五张卡片全部渲染，标题正确，第五张有图表图标且宽度占两列。
- 查询块与 base 块渲染出真实内容，不是空白或报错。
- 在 `Home.md` 里改一个字保存 → 首页卡片自动更新。
- 点铅笔图标 → 打开 `Home.md`，光标落在该卡片标题行。
- 点垃圾桶 → 卡片消失，`Home.md` 里对应 section 被删掉。
- 快速连续改两次内容 → 卡片不出现重复内容或残留旧 DOM。
- 在控制台执行 `document.querySelectorAll('.home-card[data-card-id]').length`，与卡片数量一致。

- [ ] **Step 6: 提交**

```bash
git add src/card.ts src/home-view.ts src/main.ts esbuild.config.mjs styles.css
git commit -m "feat: 卡片渲染管线与 MarkdownRenderer 生命周期管理"
```

---

### Task 11: 网格拖拽排序

**Files:**
- Create: `src/card-grid.ts`
- Modify: `src/card.ts`, `src/home-view.ts`, `src/main.ts`, `styles.css`
- Test: `tests/drop-index.test.ts`

**Interfaces:**
- Consumes: `CardSection`（Task 3）；`moveCard`（Task 4）；`CardView`（Task 10）
- Produces: `Rect`、`computeDropIndex(rects: Rect[], x: number, y: number): number`、`enableCardDrag(args: DragArgs): () => void`

```ts
interface DragArgs {
  gridEl: HTMLElement;
  cardEl: HTMLElement;
  handleEl: HTMLElement;
  index: number;
  onDrop: (from: number, to: number) => void;
  isEnabled: () => boolean;
}
```

- [ ] **Step 1: 写失败的测试**

`tests/drop-index.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { computeDropIndex } from "../src/card-grid";

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

describe("computeDropIndex", () => {
  const row = [rect(0, 0, 100, 100), rect(100, 0, 200, 100), rect(200, 0, 300, 100)];
  const twoRows = [...row, rect(0, 120, 100, 220), rect(100, 120, 200, 220), rect(200, 120, 300, 220)];

  it("returns 0 when the pointer is above every card", () => {
    expect(computeDropIndex(row, 250, -10)).toBe(0);
  });

  it("returns the length when the pointer is below every card", () => {
    expect(computeDropIndex(row, 250, 999)).toBe(3);
    expect(computeDropIndex(twoRows, 150, 999)).toBe(6);
  });

  it("inserts before a card when the pointer is left of its centre", () => {
    expect(computeDropIndex(row, 110, 50)).toBe(1);
    expect(computeDropIndex(row, 210, 50)).toBe(2);
  });

  it("inserts after a card when the pointer is right of its centre", () => {
    expect(computeDropIndex(row, 180, 50)).toBe(2);
    expect(computeDropIndex(row, 290, 50)).toBe(3);
  });

  it("uses the vertical position first so rows do not interleave", () => {
    expect(computeDropIndex(twoRows, 290, 50)).toBe(3);
    expect(computeDropIndex(twoRows, 10, 150)).toBe(4);
    expect(computeDropIndex(twoRows, 290, 150)).toBe(6);
  });

  it("handles an empty grid", () => {
    expect(computeDropIndex([], 10, 10)).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/drop-index.test.ts`
Expected: FAIL — 无法解析 `../src/card-grid`。

- [ ] **Step 3: 写实现**

`src/card-grid.ts`：

```ts
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function computeDropIndex(rects: Rect[], x: number, y: number): number {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!;
    if (y < rect.top) {
      return i;
    }
    if (y <= rect.bottom) {
      if (x < (rect.left + rect.right) / 2) {
        return i;
      }
      continue;
    }
  }
  return rects.length;
}

export interface DragArgs {
  gridEl: HTMLElement;
  cardEl: HTMLElement;
  handleEl: HTMLElement;
  index: number;
  onDrop: (from: number, to: number) => void;
  isEnabled: () => boolean;
}

function cardRects(gridEl: HTMLElement): Rect[] {
  return Array.from(gridEl.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasClass("home-card"))
    .map((card) => card.getBoundingClientRect());
}

export function enableCardDrag(args: DragArgs): () => void {
  const { gridEl, cardEl, handleEl, index, onDrop, isEnabled } = args;

  const enableDraggable = (): void => {
    cardEl.setAttribute("draggable", "true");
  };
  const disableDraggable = (): void => {
    cardEl.removeAttribute("draggable");
  };

  const handleDragStart = (event: DragEvent): void => {
    if (!isEnabled()) {
      event.preventDefault();
      return;
    }
    cardEl.addClass("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (event: DragEvent): void => {
    if (!isEnabled()) {
      return;
    }
    event.preventDefault();
    gridEl.dataset["dropIndex"] = String(
      computeDropIndex(cardRects(gridEl), event.clientX, event.clientY),
    );
  };

  const handleDrop = (event: DragEvent): void => {
    if (!isEnabled()) {
      return;
    }
    event.preventDefault();
    let target = computeDropIndex(cardRects(gridEl), event.clientX, event.clientY);
    if (target > index) {
      target -= 1;
    }
    if (target !== index) {
      onDrop(index, target);
    }
  };

  const handleDragEnd = (): void => {
    cardEl.removeClass("is-dragging");
    delete gridEl.dataset["dropIndex"];
    disableDraggable();
  };

  handleEl.addEventListener("pointerdown", enableDraggable);
  cardEl.addEventListener("dragstart", handleDragStart);
  cardEl.addEventListener("dragover", handleDragOver);
  cardEl.addEventListener("drop", handleDrop);
  cardEl.addEventListener("dragend", handleDragEnd);

  return () => {
    handleEl.removeEventListener("pointerdown", enableDraggable);
    cardEl.removeEventListener("dragstart", handleDragStart);
    cardEl.removeEventListener("dragover", handleDragOver);
    cardEl.removeEventListener("drop", handleDrop);
    cardEl.removeEventListener("dragend", handleDragEnd);
  };
}
```

只有按住抓手才把 `draggable` 打开，松手即撤掉——否则卡片正文里的文字无法正常选中。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/drop-index.test.ts`
Expected: PASS，6 个用例。

- [ ] **Step 5: 接进卡片与首页**

`src/card.ts`：`CardViewArgs` 增加两个字段，并保存 drag 的清理函数。

```ts
export interface CardViewArgs {
  app: App;
  section: CardSection;
  dashboardPath: string;
  cardId: string;
  index: number;
  gridEl: HTMLElement;
  callbacks: CardCallbacks;
  onDrop: (from: number, to: number) => void;
}
```

在 `CardView` 增加字段：

```ts
  dragEnabled = true;
  private disposeDrag: () => void = () => undefined;
```

构造函数最后追加：

```ts
    this.disposeDrag = enableCardDrag({
      gridEl: args.gridEl,
      cardEl: this.el,
      handleEl: this.handleEl,
      index: args.index,
      onDrop: args.onDrop,
      isEnabled: () => this.dragEnabled,
    });
```

`handleEl` 用的是 Task 10 里存下来的抓手指针，只有按住抓手才会把卡片的 `draggable` 打开——这样卡片正文里的文字仍然可以正常选中。

`destroy()` 里补一行：

```ts
    this.disposeDrag();
```

`src/card.ts` 顶部新增：

```ts
import { enableCardDrag } from "./card-grid";
```

- [ ] **Step 6: 在 main.ts 里补 moveCard**

`src/main.ts` 已经有 `appendCard as appendCardInText` 与 `removeCard as removeCardInText` 两个导入（Task 9 加的），这里只补 `moveCard`：

```ts
import {
  appendCard as appendCardInText,
  moveCard as moveCardInText,
  removeCard as removeCardInText,
} from "./dashboard/edit";
```

新增方法：

```ts
  async moveCard(from: number, to: number): Promise<void> {
    const sections = await this.store.sections();
    const last = sections.length - 1;
    if (from === to || from < 0 || to < 0 || from > last || to > last) {
      return;
    }
    await this.markSelfWriting(async () => {
      await this.store.process((text) => moveCardInText(text, sections, from, to));
    });
    this.refreshHome();
  }
```

`home-view.ts` 里构建卡片时补上新增的三个参数：

```ts
        index: section.index,
        gridEl: grid,
        onDrop: (from, to) => {
          void this.plugin.moveCard(from, to);
        },
```

- [ ] **Step 7: 补样式**

`styles.css` 追加：

```css
.home-card.is-dragging {
  opacity: 0.45;
}

.home-card-drag-area {
  display: inline-flex;
}
```

- [ ] **Step 8: 手工验收**

- 悬停卡片 → 出现抓手图标；按住抓手拖动 → 卡片半透明，松手后顺序变化。
- 松手后用编辑器打开 `Home.md` 确认：section 顺序**确实改变**，其他 section 文本未变。
- 直接拖卡片正文（不按住抓手）→ 不触发拖拽，文字仍可选中。
- 重启 Obsidian 后顺序保持。

- [ ] **Step 9: 提交**

```bash
git add src/card-grid.ts src/card.ts src/home-view.ts src/main.ts styles.css tests/drop-index.test.ts
git commit -m "feat: 卡片拖拽排序，直接改写仪表盘 section 顺序"
```

---

### Task 12: Logo、Wordmark 与背景

**Files:**
- Create: `src/background.ts`, `src/page-header.ts`
- Modify: `src/home-view.ts`, `styles.css`
- Test: 手工验收

**Interfaces:**
- Consumes: `CardHomeTabSettings`（Task 1）
- Produces: `resolveAssetSource(app: App, type: "vaultImage" | "url", value: string): string | null`、`renderBackground(root: HTMLElement, app: App, settings: CardHomeTabSettings): void`、`renderHeader(root: HTMLElement, app: App, settings: CardHomeTabSettings): void`

- [ ] **Step 1: 写实现**

`src/background.ts`：

```ts
import { getResourcePath, type App } from "obsidian";
import type { CardHomeTabSettings } from "./settings";

export function resolveAssetSource(
  app: App,
  type: "vaultImage" | "url",
  value: string,
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (type === "url") {
    return trimmed;
  }
  const file = app.metadataCache.getFirstLinkpathDest(trimmed, "");
  return file ? getResourcePath(file) : null;
}

export function renderBackground(
  root: HTMLElement,
  app: App,
  settings: CardHomeTabSettings,
): void {
  if (settings.backgroundType === "none") {
    return;
  }
  const isDark = document.body.hasClass("theme-dark");
  const preferred = isDark ? settings.backgroundDark : settings.backgroundLight;
  const fallback = isDark ? settings.backgroundLight : settings.backgroundDark;
  const source = resolveAssetSource(
    app,
    settings.backgroundType,
    preferred.trim().length > 0 ? preferred : fallback,
  );
  if (!source) {
    return;
  }

  const layer = root.createDiv({ cls: "home-tab-background" });
  layer.style.backgroundImage = `url("${source}")`;
  if (settings.backgroundBlur > 0) {
    layer.style.filter = `blur(${settings.backgroundBlur}px)`;
    layer.style.inset = `-${settings.backgroundBlur * 2}px`;
  }
  if (settings.backgroundDim > 0) {
    const veil = root.createDiv({ cls: "home-tab-background-veil" });
    veil.style.backgroundColor = `rgba(0, 0, 0, ${settings.backgroundDim / 100})`;
  }
}
```

`src/page-header.ts`：

```ts
import { setIcon, type App } from "obsidian";
import { resolveAssetSource } from "./background";
import type { CardHomeTabSettings } from "./settings";

export function renderHeader(
  root: HTMLElement,
  app: App,
  settings: CardHomeTabSettings,
): void {
  const hero = root.createDiv({ cls: "home-tab-hero" });

  if (settings.logoType !== "none") {
    const logo = hero.createDiv({ cls: "home-tab-logo" });
    if (settings.logoType === "lucide") {
      setIcon(logo, settings.logoValue.trim() || "lucide-home");
    } else {
      const source = resolveAssetSource(app, settings.logoType, settings.logoValue);
      if (source) {
        logo.createEl("img", { attr: { src: source, alt: "" } });
      } else {
        setIcon(logo, "lucide-image-off");
        logo.addClass("is-missing");
      }
    }
    logo.style.setProperty("--home-tab-logo-scale", String(settings.logoScale));
    if (settings.logoColor.trim().length > 0) {
      logo.style.color = settings.logoColor;
    }
  }

  if (settings.showWordmark && settings.wordmark.trim().length > 0) {
    const wordmark = hero.createDiv({ cls: "home-tab-wordmark", text: settings.wordmark });
    wordmark.style.fontSize = settings.fontSize;
    wordmark.style.fontWeight = String(settings.fontWeight);
  }
}
```

- [ ] **Step 2: 接进首页视图**

`home-view.ts` 的 `render()` 里，在创建 `grid` 之前插入：

```ts
    const stage = root.createDiv({ cls: "home-tab-stage" });
    renderBackground(stage, this.app, this.plugin.settings);
    renderHeader(stage, this.app, this.plugin.settings);
```

并把 `grid` 的父节点从 `root` 改成 `stage`：`const grid = stage.createDiv({ cls: "home-tab-cards" });`

缺失提示那条分支留在 `root` 上，不放进 `stage`。

新增 import：

```ts
import { renderBackground } from "./background";
import { renderHeader } from "./page-header";
```

- [ ] **Step 3: 补样式**

`styles.css` 追加：

```css
.home-tab-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--size-4-6);
}

.home-tab-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  pointer-events: none;
}

.home-tab-background-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.home-tab-hero {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-4-2);
}

.home-tab-cards {
  position: relative;
  z-index: 2;
}

.home-tab-logo {
  display: flex;
  color: var(--text-accent);
}

.home-tab-logo svg {
  width: calc(3em * var(--home-tab-logo-scale, 1));
  height: calc(3em * var(--home-tab-logo-scale, 1));
}

.home-tab-logo img {
  width: calc(3em * var(--home-tab-logo-scale, 1));
  height: auto;
}

.home-tab-logo.is-missing {
  color: var(--text-faint);
}

.home-tab-wordmark {
  line-height: 1.1;
  color: var(--text-normal);
}
```

- [ ] **Step 4: 手工验收**

设置页在 Task 15 才做，本任务直接改 `.obsidian/plugins/card-home-tab/data.json` 验证（改完重启插件）：

- `logoType: "lucide"`、`logoValue: "lucide-flame"` → 出现火焰图标。
- `logoType: "vaultImage"`、`logoValue: "res/Pasted image 20240523151030.png"` → 出现该图片。
- `logoType: "url"`、`logoValue: "https://example.com/x.png"` → 网络图片失败时显示占位图标而非报错。
- `backgroundType: "vaultImage"`、`backgroundLight: "res/<某张图>"` → 出现背景图；`backgroundBlur: 8`、`backgroundDim: 40` → 模糊与压暗生效。
- `wordmark: "学习笔记"`、`fontSize: "3em"` → 文字与字号生效。
- 切换亮/暗主题 → 两套背景各自生效。
- 卡片仍可正常点击、拖拽、选中文字（背景层不吞事件）。

- [ ] **Step 5: 提交**

```bash
git add src/background.ts src/page-header.ts src/home-view.ts styles.css
git commit -m "feat: 自定义 logo、wordmark 与背景图层"
```

---

### Task 13: 搜索框

**Files:**
- Create: `src/search-bar.ts`
- Modify: `src/home-view.ts`, `src/main.ts`, `styles.css`
- Test: `tests/search-candidates.test.ts`

**Interfaces:**
- Consumes: `CardHomeTabSettings`、`RecentFile`（Task 1）
- Produces: `SearchCandidate`、`buildCandidates(app: App, settings: CardHomeTabSettings, bookmarkPaths: string[], recentPaths: string[]): SearchCandidate[]`、`readBookmarkPaths(app: App): Promise<string[]>`、`renderSearchBar(root: HTMLElement, app: App, settings: CardHomeTabSettings, candidates: SearchCandidate[], emptyState: SearchCandidate[], onOpen: (candidate: SearchCandidate, newLeaf: boolean) => void): void`、`rememberRecentFile(settings: CardHomeTabSettings, path: string): RecentFile[]`

- [ ] **Step 1: 写失败的测试**

`buildCandidates` 与 `rememberRecentFile` 是纯函数（把候选集用普通对象喂进来），单独抽出便于测试。

`tests/search-candidates.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { rememberRecentFile } from "../src/search-bar";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("rememberRecentFile", () => {
  it("puts the newest entry first", () => {
    const settings = { ...DEFAULT_SETTINGS, recentFiles: [{ path: "a.md", timestamp: 1 }] };
    expect(rememberRecentFile(settings, "b.md")).toEqual([
      { path: "b.md", timestamp: expect.any(Number) },
      { path: "a.md", timestamp: 1 },
    ]);
  });

  it("moves an existing entry to the front instead of duplicating it", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      recentFiles: [
        { path: "a.md", timestamp: 1 },
        { path: "b.md", timestamp: 2 },
      ],
    };
    const result = rememberRecentFile(settings, "b.md");
    expect(result.map((entry) => entry.path)).toEqual(["b.md", "a.md"]);
    expect(result.filter((entry) => entry.path === "b.md")).toHaveLength(1);
  });

  it("truncates to maxRecentFiles", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      maxRecentFiles: 2,
      recentFiles: [
        { path: "a.md", timestamp: 1 },
        { path: "b.md", timestamp: 2 },
      ],
    };
    expect(rememberRecentFile(settings, "c.md").map((entry) => entry.path)).toEqual([
      "c.md",
      "a.md",
    ]);
  });

  it("does not mutate the input array", () => {
    const settings = { ...DEFAULT_SETTINGS, recentFiles: [{ path: "a.md", timestamp: 1 }] };
    rememberRecentFile(settings, "b.md");
    expect(settings.recentFiles).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/search-candidates.test.ts`
Expected: FAIL — 无法解析 `../src/search-bar`。

- [ ] **Step 3: 写实现**

`src/search-bar.ts`：

```ts
import {
  AbstractInputSuggest,
  prepareFuzzySearch,
  type App,
  type SearchResult,
} from "obsidian";
import type { CardHomeTabSettings, RecentFile } from "./settings";

export interface SearchCandidate {
  path: string;
  basename: string;
  kind: "file" | "bookmark" | "recent";
}

const MAX_FILE_SUGGESTIONS = 200;

export function rememberRecentFile(
  settings: CardHomeTabSettings,
  path: string,
): RecentFile[] {
  const limit = Math.max(0, settings.maxRecentFiles);
  if (limit === 0) {
    return [];
  }
  const entry: RecentFile = { path, timestamp: Date.now() };
  return [entry, ...settings.recentFiles.filter((item) => item.path !== path)].slice(0, limit);
}

export async function readBookmarkPaths(app: App): Promise<string[]> {
  const path = `${app.vault.configDir}/bookmarks.json`;
  try {
    const raw = await app.vault.adapter.read(path);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return [];
    }
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return [];
    }
    const paths: string[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const record = item as { type?: unknown; path?: unknown };
      if (record.type === "file" && typeof record.path === "string") {
        paths.push(record.path);
      }
    }
    return paths;
  } catch {
    return [];
  }
}

export function buildCandidates(
  app: App,
  settings: CardHomeTabSettings,
  bookmarkPaths: string[],
  recentPaths: string[],
): SearchCandidate[] {
  const available = new Map<string, SearchCandidate>();
  const files = settings.markdownOnly ? app.vault.getMarkdownFiles() : app.vault.getFiles();
  for (const file of files) {
    available.set(file.path, { path: file.path, basename: file.basename, kind: "file" });
  }

  const candidates: SearchCandidate[] = [];
  const seen = new Set<string>();
  const push = (path: string, kind: SearchCandidate["kind"]): void => {
    if (seen.has(path)) {
      return;
    }
    const found = available.get(path);
    if (!found) {
      return;
    }
    seen.add(path);
    candidates.push({ ...found, kind });
  };

  if (settings.showBookmarks) {
    for (const path of bookmarkPaths) {
      push(path, "bookmark");
    }
  }
  if (settings.showRecentFiles) {
    for (const path of recentPaths) {
      push(path, "recent");
    }
  }
  for (const candidate of available.values()) {
    if (!seen.has(candidate.path)) {
      seen.add(candidate.path);
      candidates.push(candidate);
    }
  }
  return candidates;
}

class CandidateSuggest extends AbstractInputSuggest<SearchCandidate> {
  private readonly candidates: SearchCandidate[];
  private readonly emptyState: SearchCandidate[];
  private readonly showPath: boolean;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    candidates: SearchCandidate[],
    emptyState: SearchCandidate[],
    showPath: boolean,
  ) {
    super(app, inputEl);
    this.candidates = candidates;
    this.emptyState = emptyState;
    this.showPath = showPath;
    this.limit = MAX_FILE_SUGGESTIONS;
  }

  protected getSuggestions(query: string): SearchCandidate[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return this.emptyState;
    }
    const match = prepareFuzzySearch(trimmed);
    const scored: { candidate: SearchCandidate; score: number }[] = [];
    for (const candidate of this.candidates) {
      const result: SearchResult | null = match(candidate.path);
      if (result) {
        scored.push({ candidate, score: result.score });
      }
    }
    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, this.limit).map((entry) => entry.candidate);
  }

  renderSuggestion(candidate: SearchCandidate, el: HTMLElement): void {
    const title = el.createDiv({ cls: "home-tab-suggestion-title" });
    title.createSpan({ text: candidate.basename });
    if (candidate.kind !== "file") {
      title.createSpan({
        cls: "home-tab-suggestion-tag",
        text: candidate.kind === "bookmark" ? "书签" : "最近",
      });
    }
    if (this.showPath) {
      el.createDiv({ cls: "home-tab-suggestion-path", text: candidate.path });
    }
  }
}

export function renderSearchBar(
  root: HTMLElement,
  app: App,
  settings: CardHomeTabSettings,
  candidates: SearchCandidate[],
  emptyState: SearchCandidate[],
  onOpen: (candidate: SearchCandidate, newLeaf: boolean) => void,
): void {
  const wrapper = root.createDiv({ cls: "home-tab-search" });
  const input = wrapper.createEl("input", {
    cls: "home-tab-search-input",
    attr: { type: "text", placeholder: "搜索笔记…" },
  });

  const suggest = new CandidateSuggest(app, input, candidates, emptyState, settings.showPath);
  suggest.onSelect((candidate, event) => {
    input.value = "";
    onOpen(candidate, event.ctrlKey || event.metaKey);
  });
}
```

`class CandidateSuggest` 里 `renderSuggestion` 只渲染纯文本，不做匹配高亮——`renderResults` 的高亮需要把 `matches` 一起传进去，属于锦上添花，本版不做，以免主体功能被签名细节拖住。

回车、上下键、鼠标点击的选择逻辑全部交给 `AbstractInputSuggest` 基类处理，不要自己再挂 `keydown` 监听，否则会和基类的 Enter 处理重复触发。`Ctrl/Cmd+Enter` 通过在 `onSelect` 的 `event` 上读 `ctrlKey`／`metaKey` 区分——鼠标事件与键盘事件都带这两个属性。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/search-candidates.test.ts`
Expected: PASS，4 个用例。

- [ ] **Step 5: 接进首页视图与设置记忆**

`home-view.ts` 的 `render()` 里，在 `renderHeader` 之后插入搜索框（仅当 `showSearch`）：

```ts
    if (this.plugin.settings.showSearch) {
      const bookmarkPaths = await readBookmarkPaths(this.app);
      const recentPaths = this.plugin.settings.recentFiles.map((entry) => entry.path);
      const candidates = buildCandidates(this.app, this.plugin.settings, bookmarkPaths, recentPaths);
      const emptyState = candidates
        .filter((candidate) => candidate.kind !== "file")
        .slice(0, Math.max(this.plugin.settings.maxResults, this.plugin.settings.maxRecentFiles));
      renderSearchBar(stage, this.app, this.plugin.settings, candidates, emptyState, (candidate, newLeaf) => {
        void this.plugin.openSearchResult(candidate.path, newLeaf);
      });
    }
```

新增 import：

```ts
import { buildCandidates, readBookmarkPaths, renderSearchBar } from "./search-bar";
```

`main.ts` 新增方法：

```ts
  async openSearchResult(path: string, newLeaf: boolean): Promise<void> {
    this.settings.recentFiles = rememberRecentFile(this.settings, path);
    await this.saveSettings();
    if (newLeaf) {
      await this.app.workspace.openLinkText(path, "", "tab");
    } else {
      await this.app.workspace.openLinkText(path, "", false);
    }
  }
```

新增 import：`import { rememberRecentFile } from "./search-bar";`

- [ ] **Step 6: 补样式**

`styles.css` 追加：

```css
.home-tab-search {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 700px;
  margin: 0 auto;
}

.home-tab-search-input {
  width: 100%;
  padding: var(--size-4-2) var(--size-4-3);
  font-size: var(--font-ui-medium);
}

.home-tab-suggestion-title {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
}

.home-tab-suggestion-tag {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  padding: 0 var(--size-2-2);
}

.home-tab-suggestion-path {
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
}
```

- [ ] **Step 7: 手工验收**

- 输入几个字符 → 弹出建议列表；上下键可选，回车打开对应笔记。
- 空输入时 → 只显示书签与最近文件。
- `Ctrl/Cmd+Enter` → 在新标签页打开。
- 打开过的笔记 → 重新进首页后出现在「最近」里。
- 在设置数据里把 `showBookmarks`、`showRecentFiles`、`markdownOnly` 分别改成 `false` → 对应来源从候选里消失。
- 书签文件不存在或损坏时（临时改名 `.obsidian/bookmarks.json`）→ 首页仍正常渲染，只是没有书签建议。

- [ ] **Step 8: 提交**

```bash
git add src/search-bar.ts src/home-view.ts src/main.ts styles.css tests/search-candidates.test.ts
git commit -m "feat: 文件名模糊搜索与书签/最近文件建议"
```

---

### Task 14: 卡片设置弹窗

**Files:**
- Create: `src/card-settings.ts`
- Modify: `src/main.ts`, `styles.css`
- Test: 手工验收

**Interfaces:**
- Consumes: `CardSection`（Task 3）；`updateCardMeta`（Task 4）；`CardMeta`（Task 2）；`SnippetRegistry`（Task 7）
- Produces: `class CardSettingsPopover { constructor(args: CardSettingsArgs); open(): void; close(): void }`

```ts
interface CardSettingsArgs {
  app: App;
  section: CardSection;
  snippets: SnippetRegistry;
  onApply: (meta: CardMeta) => void;
}
```

- [ ] **Step 1: 写实现**

`src/card-settings.ts`：

```ts
import { Modal, getIconIds, setIcon, type App } from "obsidian";
import type { CardMeta } from "./dashboard/metadata";
import type { CardSection } from "./dashboard/parse";
import type { SnippetRegistry } from "./snippets";

export interface CardSettingsArgs {
  app: App;
  section: CardSection;
  snippets: SnippetRegistry;
  onApply: (meta: CardMeta) => void;
}

const AUTO_OPTION = "__auto__";

export class CardSettingsModal extends Modal {
  private readonly args: CardSettingsArgs;
  private draft: CardMeta;
  private selectedSnippets: string[];
  private iconValue: string;
  private spanValue: number;
  private iconPreview: HTMLElement | null = null;
  private autoBox: HTMLInputElement | null = null;

  constructor(args: CardSettingsArgs) {
    super(args.app);
    this.args = args;
    this.draft = {
      css: [...args.section.meta.css],
      span: args.section.meta.span,
      icon: args.section.meta.icon,
      entries: args.section.meta.entries.map((entry) => ({ ...entry })),
    };
    this.selectedSnippets = this.draft.css.filter((ref) => ref !== "auto");
    this.iconValue = this.draft.icon;
    this.spanValue = this.draft.span;
  }

  async onOpen(): Promise<void> {
    await this.args.snippets.ensureUserNames();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `卡片设置：${this.args.section.title}` });

    this.renderIcon(contentEl);
    this.renderSnippets(contentEl);
    this.renderSpan(contentEl);
    this.renderFooter(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderIcon(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "home-tab-setting-row" });
    row.createDiv({ cls: "home-tab-setting-label", text: "图标" });

    const controls = row.createDiv({ cls: "home-tab-setting-control" });
    this.iconPreview = controls.createSpan({ cls: "home-tab-icon-preview" });
    this.paintIconPreview();

    const datalist = controls.createEl("datalist", { attr: { id: "home-tab-icon-ids" } });
    for (const id of getIconIds().slice(0, 400)) {
      datalist.createEl("option", { attr: { value: id } });
    }
    const input = controls.createEl("input", {
      attr: { type: "text", list: "home-tab-icon-ids", placeholder: "lucide-chart" },
    });
    input.value = this.iconValue;
    input.addEventListener("input", () => {
      this.iconValue = input.value.trim();
      this.paintIconPreview();
    });
  }

  private paintIconPreview(): void {
    const preview = this.iconPreview;
    if (!preview) {
      return;
    }
    preview.empty();
    if (this.iconValue.length === 0) {
      preview.setText("无");
      return;
    }
    setIcon(preview, this.iconValue);
  }

  private renderSnippets(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "home-tab-setting-row is-column" });
    row.createDiv({ cls: "home-tab-setting-label", text: "CSS 片段" });

    const autoLabel = row.createEl("label", { cls: "home-tab-checkbox" });
    const autoBox = autoLabel.createEl("input", { attr: { type: "checkbox" } });
    this.autoBox = autoBox;
    autoBox.checked = this.draft.css.includes("auto");
    autoLabel.createSpan({ text: "自动（按卡片里的内容类型套用内置片段）" });
    autoBox.addEventListener("change", () => {
      if (autoBox.checked) {
        this.selectedSnippets = [];
        this.renderSnippetList();
      }
    });

    row.createDiv({ cls: "home-tab-snippet-list" });
    this.renderSnippetList();
  }

  private renderSnippetList(): void {
    const list = this.contentEl.querySelector(".home-tab-snippet-list");
    if (!(list instanceof HTMLElement)) {
      return;
    }
    list.empty();
    for (const info of this.args.snippets.list()) {
      const label = list.createEl("label", { cls: "home-tab-checkbox" });
      const box = label.createEl("input", { attr: { type: "checkbox" } });
      box.checked = this.selectedSnippets.includes(info.ref);
      const text = info.source === "builtin" ? `内置：${info.name}` : `用户：${info.name}`;
      label.createSpan({ text });
      if (info.path) {
        label.createSpan({ cls: "home-tab-snippet-path", text: info.path });
      }
      box.addEventListener("change", () => {
        if (box.checked) {
          if (!this.selectedSnippets.includes(info.ref)) {
            this.selectedSnippets.push(info.ref);
          }
        } else {
          this.selectedSnippets = this.selectedSnippets.filter((ref) => ref !== info.ref);
        }
      });
    }
  }

  private renderSpan(parent: HTMLElement): void {
    const row = parent.createDiv({ cls: "home-tab-setting-row" });
    row.createDiv({ cls: "home-tab-setting-label", text: "跨列数" });
    const input = row.createEl("input", {
      cls: "home-tab-span-input",
      attr: { type: "number", min: "1", max: "6" },
    });
    input.value = String(this.spanValue);
    input.addEventListener("input", () => {
      const parsed = Number.parseInt(input.value, 10);
      this.spanValue = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 6) : 1;
    });
  }

  private renderFooter(parent: HTMLElement): void {
    const footer = parent.createDiv({ cls: "home-tab-setting-footer" });
    const cancel = footer.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const apply = footer.createEl("button", { text: "应用", cls: "mod-cta" });
    apply.addEventListener("click", () => {
      const auto = this.autoBox?.checked ?? false;
      this.draft.css = auto ? ["auto"] : [...this.selectedSnippets];
      this.draft.span = this.spanValue;
      this.draft.icon = this.iconValue;
      this.args.onApply(this.draft);
      this.close();
    });
  }
}
```

- [ ] **Step 2: 接进插件**

`main.ts`：删掉 Task 10 的占位实现，换成：

```ts
  openCardSettings(section: CardSection): void {
    new CardSettingsModal({
      app: this.app,
      section,
      snippets: this.snippets,
      onApply: (meta) => {
        void this.applyCardMeta(section, meta);
      },
    }).open();
  }

  async applyCardMeta(section: CardSection, meta: CardMeta): Promise<void> {
    const sections = await this.store.sections();
    const current = sections.find((candidate) => candidate.start === section.start);
    if (!current) {
      new Notice("这张卡片已经不存在了，可能文件已被改动");
      return;
    }
    await this.markSelfWriting(async () => {
      await this.store.process((text) => updateCardMetaInText(text, current, meta));
    });
    this.refreshHome();
  }
```

新增 import：

```ts
import { CardSettingsModal } from "./card-settings";
import { updateCardMeta as updateCardMetaInText } from "./dashboard/edit";
import type { CardMeta } from "./dashboard/metadata";
```

**为什么用 `Modal` 而不是锚定 popover**：锚定浮层要自己处理定位、外部点击关闭、层级与滚动跟随，而 `Modal` 自带焦点陷阱与 Esc 关闭。卡片设置项不多，用 `Modal` 更省事也更稳。

- [ ] **Step 3: 补样式**

`styles.css` 追加：

```css
.home-tab-setting-row {
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
  margin-bottom: var(--size-4-3);
}

.home-tab-setting-row.is-column {
  flex-direction: column;
}

.home-tab-setting-label {
  flex: 0 0 6em;
  color: var(--text-muted);
}

.home-tab-setting-control {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  flex: 1;
}

.home-tab-icon-preview {
  display: inline-flex;
  width: 2em;
  height: 2em;
  align-items: center;
  justify-content: center;
  color: var(--text-accent);
}

.home-tab-snippet-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  max-height: 16em;
  overflow: auto;
}

.home-tab-checkbox {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
}

.home-tab-snippet-path {
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
}

.home-tab-setting-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--size-4-2);
  margin-top: var(--size-4-4);
}
```

- [ ] **Step 4: 手工验收**

- 点齿轮 → 弹出卡片设置；图标预览随输入实时变化。
- 勾选「自动」→ 片段多选被清空；取消勾选后可手动选片段。
- 选 `内置：base` 与应用 → `Home.md` 里该卡片出现 `%%card: css=base%%`（或与已有键合并），**其余 section 逐字节未变**。
- 改跨列数 → 卡片宽度变化，`%%card:%%` 里出现 `span=2`。
- 改图标 → 卡片标题前出现图标，`%%card:%%` 里出现 `icon=lucide-chart`。
- 把片段、跨列数、图标全部改回默认 → `%%card:%%` 整行消失。
- 选一个 `user:` 片段（先在 `.obsidian/snippets/` 放一个 `mine.css`）→ 该卡片样式变化，其他卡片与正文不受影响。
- 在片段里写 `@import url(x.css);` → 卡片样式不生效并在控制台出现拒绝警告，页面不崩。

- [ ] **Step 5: 提交**

```bash
git add src/card-settings.ts src/card.ts src/main.ts src/home-view.ts styles.css
git commit -m "feat: 首页内交互式修改卡片图标、片段与跨列数"
```

---

### Task 15: 设置页

**Files:**
- Create: `src/settings-tab.ts`
- Modify: `src/main.ts`
- Test: 手工验收

**Interfaces:**
- Consumes: `CardHomeTabSettings`（Task 1）；`SnippetRegistry`（Task 7）
- Produces: `class CardHomeTabSettingTab extends PluginSettingTab { constructor(app: App, plugin: CardHomeTabPlugin); display(): void }`

- [ ] **Step 1: 写实现**

`src/settings-tab.ts`：

```ts
import {
  AbstractInputSuggest,
  PluginSettingTab,
  prepareFuzzySearch,
  Setting,
  TFile,
  type App,
} from "obsidian";
import type CardHomeTabPlugin from "./main";

/**
 * 给"仪表盘文件"输入框加笔记补全。
 *
 * 这个字段用文本输入而不是下拉，因为它要能填一个还不存在的路径（用户先填、再让首页去创建）。
 * 但纯文本框会引出一类很难查的死局：`getAbstractFileByPath` 是**大小写敏感**的精确匹配，
 * 用户在 Windows/macOS 上把 `Home.md` 打成 `home.md`，文件明明在库里，`exists()` 却永远为 false，
 * 首页一直显示"文件缺失"，点"创建并打开"也修不好。补全让用户从真实文件名里选，从源头消掉这种输入。
 * `normalizeVaultPath` 仍然保留，作为手改 data.json 等情况下的兜底。
 *
 * `onPick` 是必需的：`setValue` 只是直接赋值给 input，不会触发 `input` 事件，
 * 所以 Setting 的 `onChange` 收不到，选择结果不会被保存。
 */
class FilePathSuggest extends AbstractInputSuggest<TFile> {
  private readonly onPick: (path: string) => void;

  constructor(app: App, inputEl: HTMLInputElement, onPick: (path: string) => void) {
    super(app, inputEl);
    this.onPick = onPick;
    this.limit = 50;
  }

  protected getSuggestions(query: string): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return files.slice(0, this.limit);
    }
    const match = prepareFuzzySearch(trimmed);
    const scored: { file: TFile; score: number }[] = [];
    for (const file of files) {
      const result = match(file.path);
      if (result) {
        scored.push({ file, score: result.score });
      }
    }
    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, this.limit).map((entry) => entry.file);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createDiv({ cls: "home-tab-suggestion-title", text: file.basename });
    el.createDiv({ cls: "home-tab-suggestion-path", text: file.path });
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onPick(file.path);
    this.close();
  }
}

export class CardHomeTabSettingTab extends PluginSettingTab {
  private readonly plugin: CardHomeTabPlugin;

  constructor(app: App, plugin: CardHomeTabPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;
    const save = (): void => {
      void this.plugin.saveSettings().then(() => this.plugin.refreshHome());
    };

    new Setting(containerEl).setName("页面").setHeading();

    new Setting(containerEl)
      .setName("仪表盘文件")
      .setDesc("卡片内容所在的笔记路径。用标题切分卡片。")
      .addText((text) => {
        new FilePathSuggest(this.app, text.inputEl, (path) => {
          text.setValue(path);
          settings.dashboardFile = path;
          save();
        });
        text.setValue(settings.dashboardFile).onChange((value) => {
          settings.dashboardFile = value;
          save();
        });
      });

    new Setting(containerEl)
      .setName("卡片标题级别")
      .setDesc("用几级标题切分卡片。更深级别的标题留在卡片内部渲染。")
      .addDropdown((dropdown) => {
        for (const level of [2, 3, 4, 5, 6]) {
          dropdown.addOption(String(level), `${"#".repeat(level)} 标题`);
        }
        dropdown.setValue(String(settings.cardHeadingLevel));
        dropdown.onChange((value) => {
          settings.cardHeadingLevel = Number.parseInt(value, 10);
          save();
        });
      });

    new Setting(containerEl).setName("网格列数").addSlider((slider) =>
      slider
        .setLimits(1, 6, 1)
        .setValue(settings.gridColumns)
        .setDynamicTooltip()
        .onChange((value) => {
          settings.gridColumns = value;
          save();
        }),
    );

    new Setting(containerEl)
      .setName("替换新标签页")
      .setDesc("打开新标签页时自动显示首页。")
      .addToggle((toggle) =>
        toggle.setValue(settings.replaceNewTabs).onChange((value) => {
          settings.replaceNewTabs = value;
          save();
        }),
      );

    new Setting(containerEl)
      .setName("启动时打开首页")
      .addToggle((toggle) =>
        toggle.setValue(settings.openOnStartup).onChange((value) => {
          settings.openOnStartup = value;
          save();
        }),
      );

    new Setting(containerEl).setName("品牌区").setHeading();

    new Setting(containerEl).setName("Logo 类型").addDropdown((dropdown) =>
      dropdown
        .addOptions({ none: "无", lucide: "内置图标", vaultImage: "仓库图片", url: "网络图片" })
        .setValue(settings.logoType)
        .onChange((value) => {
          settings.logoType = value as typeof settings.logoType;
          save();
          this.display();
        }),
    );

    new Setting(containerEl)
      .setName(settings.logoType === "lucide" ? "图标名" : "图片路径或链接")
      .setDesc(
        settings.logoType === "lucide"
          ? "Lucide 图标 id，例如 lucide-flame。"
          : "仓库内的图片路径，或一个 http(s) 链接。",
      )
      .addText((text) =>
        text.setValue(settings.logoValue).onChange((value) => {
          settings.logoValue = value;
          save();
        }),
      );

    new Setting(containerEl).setName("Logo 缩放").addSlider((slider) =>
      slider
        .setLimits(0.2, 5, 0.1)
        .setValue(settings.logoScale)
        .setDynamicTooltip()
        .onChange((value) => {
          settings.logoScale = value;
          save();
        }),
    );

    new Setting(containerEl)
      .setName("Logo 颜色")
      .setDesc("留空则跟随主题强调色。仅对内置图标生效。")
      .addText((text) =>
        text.setValue(settings.logoColor).onChange((value) => {
          settings.logoColor = value;
          save();
        }),
      );

    new Setting(containerEl).setName("Wordmark 文案").addText((text) =>
      text.setValue(settings.wordmark).onChange((value) => {
        settings.wordmark = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示 Wordmark").addToggle((toggle) =>
      toggle.setValue(settings.showWordmark).onChange((value) => {
        settings.showWordmark = value;
        save();
      }),
    );

    new Setting(containerEl).setName("Wordmark 字号").addText((text) =>
      text.setValue(settings.fontSize).onChange((value) => {
        settings.fontSize = value;
        save();
      }),
    );

    new Setting(containerEl).setName("Wordmark 字重").addSlider((slider) =>
      slider
        .setLimits(100, 900, 100)
        .setValue(settings.fontWeight)
        .setDynamicTooltip()
        .onChange((value) => {
          settings.fontWeight = value;
          save();
        }),
    );

    new Setting(containerEl).setName("背景").setHeading();

    new Setting(containerEl).setName("背景类型").addDropdown((dropdown) =>
      dropdown
        .addOptions({ none: "无", vaultImage: "仓库图片", url: "网络图片" })
        .setValue(settings.backgroundType)
        .onChange((value) => {
          settings.backgroundType = value as typeof settings.backgroundType;
          save();
        }),
    );

    new Setting(containerEl)
      .setName("亮色背景")
      .setDesc("仓库内图片路径或 http(s) 链接。")
      .addText((text) =>
        text.setValue(settings.backgroundLight).onChange((value) => {
          settings.backgroundLight = value;
          save();
        }),
      );

    new Setting(containerEl)
      .setName("暗色背景")
      .setDesc("留空则暗色模式也使用亮色背景。")
      .addText((text) =>
        text.setValue(settings.backgroundDark).onChange((value) => {
          settings.backgroundDark = value;
          save();
        }),
      );

    new Setting(containerEl).setName("背景模糊").addSlider((slider) =>
      slider
        .setLimits(0, 40, 1)
        .setValue(settings.backgroundBlur)
        .setDynamicTooltip()
        .onChange((value) => {
          settings.backgroundBlur = value;
          save();
        }),
    );

    new Setting(containerEl).setName("背景压暗").addSlider((slider) =>
      slider
        .setLimits(0, 100, 5)
        .setValue(settings.backgroundDim)
        .setDynamicTooltip()
        .onChange((value) => {
          settings.backgroundDim = value;
          save();
        }),
    );

    new Setting(containerEl).setName("搜索").setHeading();

    new Setting(containerEl).setName("显示搜索框").addToggle((toggle) =>
      toggle.setValue(settings.showSearch).onChange((value) => {
        settings.showSearch = value;
        save();
      }),
    );

    new Setting(containerEl).setName("仅搜索 Markdown").addToggle((toggle) =>
      toggle.setValue(settings.markdownOnly).onChange((value) => {
        settings.markdownOnly = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示路径").addToggle((toggle) =>
      toggle.setValue(settings.showPath).onChange((value) => {
        settings.showPath = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示书签").addToggle((toggle) =>
      toggle.setValue(settings.showBookmarks).onChange((value) => {
        settings.showBookmarks = value;
        save();
      }),
    );

    new Setting(containerEl).setName("显示最近文件").addToggle((toggle) =>
      toggle.setValue(settings.showRecentFiles).onChange((value) => {
        settings.showRecentFiles = value;
        save();
      }),
    );

    new Setting(containerEl).setName("最近文件条数").addSlider((slider) =>
      slider
        .setLimits(0, 20, 1)
        .setValue(settings.maxRecentFiles)
        .setDynamicTooltip()
        .onChange((value) => {
          settings.maxRecentFiles = value;
          save();
        }),
    );

    new Setting(containerEl).setName("片段").setHeading();

    void this.plugin.snippets.ensureUserNames().then(() => {
      const list = containerEl.createDiv({ cls: "home-tab-snippet-settings" });
      for (const info of this.plugin.snippets.list()) {
        const row = list.createDiv({ cls: "home-tab-snippet-settings-row" });
        row.createSpan({ text: info.source === "builtin" ? `内置：${info.name}` : `用户：${info.name}` });
        row.createSpan({ cls: "home-tab-snippet-path", text: info.path ?? "随插件发布" });
      }
      if (list.childElementCount === 0) {
        list.createDiv({ text: "还没有任何片段。" });
      }
    });

    new Setting(containerEl)
      .setName("片段目录")
      .setDesc(
        `${this.plugin.snippets.directory}（把自定义片段放这里，然后在卡片设置里引用 user:文件名）`,
      )
      .addButton((button) =>
        button.setButtonText("刷新列表").onClick(() => {
          this.plugin.snippets.invalidate();
          this.display();
        }),
      );
  }
}
```

- [ ] **Step 2: 接进插件**

`main.ts` 的 `onload` 末尾加：

```ts
    this.addSettingTab(new CardHomeTabSettingTab(this.app, this));
```

新增 import：

```ts
import { CardHomeTabSettingTab } from "./settings-tab";
```

- [ ] **Step 3: 手工验收**

- 设置页六个分区全部出现，改动后首页立刻反映（不用手动刷新）。
- 仪表盘文件输入框：输入几个字符 → 弹出笔记补全（带模糊匹配），选中后设置被保存（重开设置页仍是选中的那篇）。
- 仪表盘文件改成另一个笔记 → 首页改为渲染该笔记的卡片；路径不存在时首页显示缺失提示。
- 把大小写写错（`home.md` 而库里是 `Home.md`）→ 这是补全要避免的输入；若用户仍手打错，行为与"路径不存在"一致，不会出现"文件明明在却永远显示缺失且创建也修不好"。**这一条要实际试一次**：先手打错，确认显示缺失；再用补全选对，确认恢复。
- 卡片标题级别改成 3 → 首页改为按 `###` 切分。
- 网格列数、Logo、背景、搜索各项改动 → 首页即时生效。
- 在 `.obsidian/snippets/` 新增一个 `.css` → 点「刷新列表」后出现在片段列表里，且能在卡片设置里被选中。
- 重启 Obsidian → 所有设置保持。

- [ ] **Step 4: 提交**

```bash
git add src/settings-tab.ts src/main.ts
git commit -m "feat: 设置页覆盖页面、品牌、背景、搜索与片段"
```

---

### Task 16: 文档、CHANGELOG 与 CI

**Files:**
- Create: `README.md`, `README.zh.md`, `CHANGELOG.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: 全部前置任务的产物
- Produces: 可发布的仓库

- [ ] **Step 1: 写 README（英文版，社区目录摘录用）**

`README.md` 覆盖：一句话简介、功能列表、安装方式、卡片文件格式（含 `%%card:%%` 语法表与 `css=auto` 说明）、内置片段表（按内容类型）、每卡 CSS 片段如何生效（`@scope` 隔离、不支持 `@import`）、设置项说明、已知限制（卡片正文不能出现同级标题、`minAppVersion` 1.9.0）、许可。

- [ ] **Step 2: 写中文 README**

`README.zh.md`，内容与英文版对应。

- [ ] **Step 3: 写 CHANGELOG**

`CHANGELOG.md`：

```markdown
# Changelog

## 0.1.0

首个版本。

- 首页视图：自定义 logo、wordmark、背景图与文件名模糊搜索。
- 卡片内容取自单个仪表盘笔记，按标题切分，支持代码块、内置查询块、base 块、dataview 块等全部内容类型。
- 每张卡片可用 `%%card:%%` 注释指定 CSS 片段、跨列数与图标，并可在首页直接修改。
- CSS 片段通过 `@scope` 只作用于单张卡片，不影响全局样式。
- 随插件发布 5 个按内容类型分组的内置片段，同时支持引用 `.obsidian/snippets/` 下的自有片段。
```

- [ ] **Step 4: 写 CI**

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [master]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: Test and build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint (Obsidian plugin guidelines)
        run: npm run lint

      - name: Test, typecheck and build
        run: npm run check
```

`.github/workflows/release.yml` 沿用既有插件的结构：在 `v*` tag 上校验 `manifest.json`、`package.json`、`versions.json` 三处版本号一致，执行 `npm ci && npm run check`，把 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 作为 release 附件上传。**以既有仓库 `annote_sidebar/.github/workflows/release.yml` 的实际内容为模板改写**，不要凭记忆重写。

- [ ] **Step 5: 本地验证**

Run: `npm ci && npm run check`
Expected: 全部通过。

在加 CI 之前先确认锁文件能在公共 runner 上安装。`package-lock.json` 里每一条 `"resolved"` 的 host 必须都是 `registry.npmjs.org`；如果本机 npm 配了内网镜像（如 `mirrors.tencent.com/npm`），`npm install` 生成的锁文件会把 394 条 `resolved` 全指向内网，GitHub 的 `ubuntu-latest` 拉不到包、`npm ci` 直接失败。检查方式：

```bash
grep -c '"resolved"' package-lock.json
grep -c '"resolved": "https://registry.npmjs.org' package-lock.json
grep -c 'mirrors\.' package-lock.json
```

三个数字应当是「总数 / 总数 / 0」。不满足就删掉 `node_modules` 与 `package-lock.json`，用 `npm install --registry=https://registry.npmjs.org` 重新生成，再跑一次 `npm ci` 确认。

Run: `npm run build && ls dist`
Expected: `main.js` `manifest.json` `styles.css` 三个文件。

- [ ] **Step 6: 提交**

```bash
git add README.md README.zh.md CHANGELOG.md .github
git commit -m "docs: 补齐 README、CHANGELOG 与 CI 流水线"
```

- [ ] **Step 7: 端到端验收**

把 `dist/` 装进 vault，按设计文档的 9 条验收标准逐条确认：

1. `Home.md` 作为普通笔记打开、编辑、搜索都正常。
2. 卡片内纯文本、代码块、```` ```query ````、```` ```base ```` 正确渲染。
3. 卡片内 `![[某表.base]]`、`![[图片.png]]`、相对链接按 `Home.md` 的目录解析。
4. `%%card: css=base%%` 只影响该卡，不影响其他卡片与全局。
5. 卡片设置改动后文件被正确改写，其余 section 逐字节未变。
6. 拖拽排序后 `Home.md` 里 section 顺序确实变化。
7. 在标签页里编辑 `Home.md`，首页卡片实时更新。
8. 关闭并重开首页视图，配置与渲染结果一致。
9. 未安装 dataview 时，```` ```dataview ```` 退化为普通代码块，不报错、不影响其他卡片。

第 9 条需要临时禁用或卸载 dataview（若已安装）来验证。

- [ ] **Step 8: 提交验收记录**

把第 7 步中与预期不符的项，要么修掉并补充对应测试，要么写进 `README.md` 的「已知限制」。全部通过则无需改动，直接进入发布流程。

```bash
git status
git commit --allow-empty -m "chore: 完成端到端验收"
```


