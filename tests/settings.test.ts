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
