import { describe, expect, it, vi } from "vitest";
import { rememberRecentFile } from "../src/search-bar";
import { DEFAULT_SETTINGS } from "../src/settings";

/**
 * `obsidian` 的 npm 包只发布 `obsidian.d.ts`，package.json 里的 `main` 是空串，没有任何运行时
 * 实现，因此 `src/search-bar.ts` 里那些**值导入**（`AbstractInputSuggest`、`prepareFuzzySearch`）
 * 会让 vitest 在解析阶段就报 "Failed to resolve entry for package \"obsidian\""，
 * 连完全不碰 obsidian 的纯函数也拿不到。
 *
 * 这里按模块 id 把这层运行时依赖拦掉（`vi.mock` 会被提升到所有 import 之前），替身只需让模块
 * 能加载：`AbstractInputSuggest` 是 `CandidateSuggest` 的 extends 底座，`prepareFuzzySearch`
 * 只有 `getSuggestions` 才会调用，而本文件四条用例走的都是 `rememberRecentFile`。
 */
vi.mock("obsidian", () => ({
  AbstractInputSuggest: class {},
  prepareFuzzySearch: () => () => null,
}));

describe("rememberRecentFile", () => {
  it("puts the newest entry first", () => {
    const settings = { ...DEFAULT_SETTINGS, recentFiles: [{ path: "a.md", timestamp: 1 }] };
    expect(rememberRecentFile(settings, "b.md")).toEqual([
      { path: "b.md", timestamp: expect.any(Number) as number },
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
