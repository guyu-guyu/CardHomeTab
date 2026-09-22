import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTENT_STYLE_GROUPS,
  contentStyleFeatures,
  type ContentStyleKey,
} from "../src/content-styles";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings";

const stylesheet = readFileSync(
  fileURLToPath(new URL("../styles.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, " ");

const features = contentStyleFeatures();

describe("content style registry", () => {
  it("is not empty and has unique keys and class names", () => {
    expect(features.length).toBeGreaterThan(0);
    expect(new Set(features.map((f) => f.key)).size).toBe(features.length);
    expect(new Set(features.map((f) => f.className)).size).toBe(features.length);
    expect(new Set(CONTENT_STYLE_GROUPS.map((g) => g.id)).size).toBe(CONTENT_STYLE_GROUPS.length);
  });

  /**
   * 注册了特性却没写 CSS，就是一个开了也没反应的空开关——而且构建、类型检查、lint 全都抓不到。
   * 这里把注册表和样式表钉在一起。
   */
  it("ships a stylesheet rule for every registered feature", () => {
    for (const feature of features) {
      expect(stylesheet, `${feature.key} has no rule using .${feature.className}`).toContain(
        feature.className,
      );
    }
  });

  /** 反向：styles.css 里的开闸类都必须在注册表里，否则是改名后留下的死规则 */
  it("has no gate class in the stylesheet that the registry does not declare", () => {
    const declared = new Set(features.map((f) => f.className));
    const used = new Set(stylesheet.match(/is-[a-z0-9-]+/g) ?? []);
    // 以下都不是内容样式开关，而是别处自己管理的状态类：
    used.delete("is-dragging"); // card-grid 拖拽态，直接加在卡片上
    used.delete("is-missing"); // page-header 的 logo 加载失败态
    used.delete("is-column"); // 弹窗里设置行的纵向排列
    used.delete("is-masonry"); // masonry.ts 接上 ResizeObserver 后才加的布局态
    for (const gate of used) {
      expect(declared.has(gate), `stylesheet uses .${gate}, which no feature declares`).toBe(true);
    }
  });
});

describe("content style settings", () => {
  it("defaults every feature to off", () => {
    // 这些特性改变的是用户笔记的观感，升级后不该凭空生效
    for (const feature of features) {
      expect(DEFAULT_SETTINGS[feature.key], `${feature.key} must default to false`).toBe(false);
    }
  });

  it("round-trips every feature through mergeSettings", () => {
    // 遍历注册表，所以新增特性若忘了被 mergeSettings 读取（开关能点、重启后失效），这里就红
    const raw: Record<string, boolean> = {};
    for (const feature of features) {
      raw[feature.key] = true;
    }
    const merged = mergeSettings(raw);
    for (const feature of features) {
      expect(merged[feature.key], `${feature.key} was not read back`).toBe(true);
    }
  });

  it("falls back to the default for a wrong-typed value", () => {
    const key: ContentStyleKey = features[0]!.key;
    expect(mergeSettings({ [key]: "yes" })[key]).toBe(DEFAULT_SETTINGS[key]);
  });

  it("keeps the features independent of one another", () => {
    // 刻意做成各自独立的布尔开关而不是一个枚举，任意组合都要成立
    const only = features[features.length - 1]!.key;
    const merged = mergeSettings({ [only]: true });
    expect(merged[only]).toBe(true);
    for (const feature of features) {
      if (feature.key !== only) {
        expect(merged[feature.key]).toBe(false);
      }
    }
  });
});
