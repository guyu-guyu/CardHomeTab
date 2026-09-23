import { describe, expect, it } from "vitest";
import { contentStyleFeatureList } from "../src/content-styles";
import {
  CONTENT_WIDTH_RANGE,
  DEFAULT_SETTINGS,
  hasChangedFromDefault,
  mergeSettings,
  NON_SECTION_KEYS,
  resetToDefault,
  SETTING_SECTION_KEYS,
} from "../src/settings";

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

/**
 * 折叠块的「重置」按钮要知道自己管哪些设置键，而那几节的控件是一条条手写的，代码里没有任何
 * 地方能反推出归属——所以归类必须显式声明，也必须有一条守卫钉住它的完备性。
 */
describe("setting sections", () => {
  const sectioned = Object.values(SETTING_SECTION_KEYS).flat();
  const registryKeys = contentStyleFeatureList().map((feature) => feature.key);

  /**
   * 这是本组最重要的一条：新增一个设置项却忘了归到某一节，它就永远不会参与重置——而且
   * 界面上看不出任何异常，没人会发现。所以把三方并起来与 `CardHomeTabSettings` 的全部键对齐。
   */
  it("classifies every setting key exactly once", () => {
    const claimed = [...sectioned, ...registryKeys, ...NON_SECTION_KEYS];
    expect(new Set(claimed).size, "a key is claimed by two sections").toBe(claimed.length);
    expect([...claimed].sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  /** 「页面」不是折叠块，其余三节都要真的被设置页当作折叠块用（否则声明了却没有重置按钮） */
  it("keeps a non-empty key list for every collapsible section", () => {
    for (const [id, keys] of Object.entries(SETTING_SECTION_KEYS)) {
      expect(keys.length, `${id} has no keys`).toBeGreaterThan(0);
    }
  });
});

describe("reset to default", () => {
  it("reports no change for a fresh settings object", () => {
    const settings = mergeSettings(undefined);
    for (const keys of Object.values(SETTING_SECTION_KEYS)) {
      expect(hasChangedFromDefault(settings, keys)).toBe(false);
    }
    expect(hasChangedFromDefault(settings, contentStyleFeatureList().map((f) => f.key))).toBe(false);
  });

  it("notices a change in any one key of the section", () => {
    // 逐个键单独改一次：漏掉某个键的比较（例如只比较了第一个）会在这里暴露
    for (const keys of Object.values(SETTING_SECTION_KEYS)) {
      for (const key of keys) {
        const settings = mergeSettings(undefined);
        const current = settings[key];
        resetToDefault(settings, keys);
        // 造一个与默认值不同的值，类型无关——重置只做等值比较
        const changed = typeof current === "boolean" ? !current : typeof current === "number" ? current + 1 : `${String(current)}-changed`;
        (settings as unknown as Record<string, unknown>)[key] = changed;
        expect(hasChangedFromDefault(settings, keys), `${key} is not compared`).toBe(true);
      }
    }
  });

  it("restores only the keys it was given", () => {
    const settings = mergeSettings(undefined);
    settings.logoScale = 3;
    settings.backgroundBlur = 20;
    resetToDefault(settings, SETTING_SECTION_KEYS.brand);
    expect(settings.logoScale).toBe(DEFAULT_SETTINGS.logoScale);
    // 别的分区不能被顺带重置
    expect(settings.backgroundBlur).toBe(20);
  });

  it("restores a content style group, including its enums and numbers", () => {
    const settings = mergeSettings(undefined);
    settings.cardRadius = 20;
    settings.cardShadow = "always";
    settings.cardTitle = false;
    const cardKeys = contentStyleFeatureList()
      .filter((feature) => feature.key.startsWith("card"))
      .map((feature) => feature.key);
    expect(hasChangedFromDefault(settings, cardKeys)).toBe(true);
    resetToDefault(settings, cardKeys);
    expect(hasChangedFromDefault(settings, cardKeys)).toBe(false);
    expect(settings.cardRadius).toBe(DEFAULT_SETTINGS.cardRadius);
    expect(settings.cardShadow).toBe(DEFAULT_SETTINGS.cardShadow);
    expect(settings.cardTitle).toBe(DEFAULT_SETTINGS.cardTitle);
  });
});

describe("content width limit", () => {
  it("defaults to unlimited, so upgrading does not narrow anyone's dashboard", () => {
    expect(mergeSettings(undefined).limitContentWidth).toBe(false);
  });

  /**
   * 设置页的滑块与这里的钳制必须共用 CONTENT_WIDTH_RANGE。各写一遍字面量的话，滑块能拖到
   * 范围外、读取时被钳回来，用户下次打开设置会看到值自己跳了，而且没有任何报错。
   */
  it("clamps the width to the same range the slider offers", () => {
    expect(mergeSettings({ contentWidth: CONTENT_WIDTH_RANGE.min }).contentWidth).toBe(
      CONTENT_WIDTH_RANGE.min,
    );
    expect(mergeSettings({ contentWidth: CONTENT_WIDTH_RANGE.max }).contentWidth).toBe(
      CONTENT_WIDTH_RANGE.max,
    );
    expect(mergeSettings({ contentWidth: CONTENT_WIDTH_RANGE.min - 100 }).contentWidth).toBe(
      CONTENT_WIDTH_RANGE.min,
    );
    expect(mergeSettings({ contentWidth: CONTENT_WIDTH_RANGE.max + 100 }).contentWidth).toBe(
      CONTENT_WIDTH_RANGE.max,
    );
  });

  /** 关掉限制不该抹掉上次调过的宽度：设置页要在重新打开开关时把它显示回来 */
  it("keeps the width while the limit is off", () => {
    const settings = mergeSettings({ limitContentWidth: false, contentWidth: 1400 });
    expect(settings.limitContentWidth).toBe(false);
    expect(settings.contentWidth).toBe(1400);
  });
});
