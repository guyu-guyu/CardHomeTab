import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { buildCandidates, readBookmarkPaths, rememberRecentFile } from "../src/search-bar";
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

describe("readBookmarkPaths", () => {
  const appWith = (json: string) =>
    ({
      vault: {
        configDir: ".vault-config",
        adapter: { read: () => Promise.resolve(json) },
      },
    }) as unknown as App;

  it("reads file bookmarks and descends into nested groups", async () => {
    const json = JSON.stringify({
      items: [
        { type: "file", path: "a.md" },
        { type: "group", items: [{ type: "file", path: "b.md" }] },
        { type: "search", query: "x" },
        { type: "group", items: [{ type: "group", items: [{ type: "file", path: "c.md" }] }] },
      ],
    });
    await expect(readBookmarkPaths(appWith(json))).resolves.toEqual(["a.md", "b.md", "c.md"]);
  });

  it("returns an empty list rather than throwing on a malformed file", async () => {
    await expect(readBookmarkPaths(appWith("not json"))).resolves.toEqual([]);
    await expect(readBookmarkPaths(appWith("[]"))).resolves.toEqual([]);
    await expect(readBookmarkPaths(appWith("{}"))).resolves.toEqual([]);
    await expect(readBookmarkPaths(appWith('{"items": "nope"}'))).resolves.toEqual([]);
  });
});

describe("buildCandidates", () => {
  const fileOf = (path: string) => ({
    path,
    basename: path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, ""),
  });
  const appWith = (paths: string[]) =>
    ({
      vault: {
        getMarkdownFiles: () => paths.map(fileOf),
        getFiles: () => paths.map(fileOf),
      },
    }) as unknown as App;

  it("orders bookmarks, then recents, then everything else", () => {
    const candidates = buildCandidates(appWith(["a.md", "b.md", "c.md"]), DEFAULT_SETTINGS, ["b.md"], ["c.md"]);
    expect(candidates.map((candidate) => `${candidate.kind}:${candidate.path}`)).toEqual([
      "bookmark:b.md",
      "recent:c.md",
      "file:a.md",
    ]);
  });

  it("never lists the same path twice, and lets the bookmark tag win", () => {
    const candidates = buildCandidates(appWith(["a.md"]), DEFAULT_SETTINGS, ["a.md"], ["a.md"]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe("bookmark");
  });

  it("drops bookmarks and recents whose path is not in the vault", () => {
    const candidates = buildCandidates(appWith(["a.md"]), DEFAULT_SETTINGS, ["gone.md"], ["also-gone.md"]);
    expect(candidates.map((candidate) => candidate.path)).toEqual(["a.md"]);
  });

  it("omits the bookmark and recent sources when the settings disable them", () => {
    const settings = { ...DEFAULT_SETTINGS, showBookmarks: false, showRecentFiles: false };
    const candidates = buildCandidates(appWith(["a.md", "b.md"]), settings, ["a.md"], ["b.md"]);
    expect(candidates.map((candidate) => candidate.kind)).toEqual(["file", "file"]);
  });
});
