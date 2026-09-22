import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { parseSnippetRef, resolveSnippetRefs, SnippetRegistry } from "../src/snippets";

describe("parseSnippetRef", () => {
  it("treats a bare name as a user snippet", () => {
    // 片段只剩一种来源，所以裸名就是用户片段：`mine` 等价于 `user:mine`
    expect(parseSnippetRef("mine")).toBe("mine");
  });

  it("accepts the explicit user prefix", () => {
    expect(parseSnippetRef("user:my-card")).toBe("my-card");
  });

  it("trims surrounding whitespace", () => {
    expect(parseSnippetRef("  user:mine  ")).toBe("mine");
    expect(parseSnippetRef("  mine  ")).toBe("mine");
  });

  it("rejects the removed builtin prefix", () => {
    // 内置片段已移除，`builtin:` 和任何别的前缀一样按无效处理（不能退化成裸名 `text`，
    // 否则会去读一个同名的用户片段，等于悄悄换了引用目标）
    expect(parseSnippetRef("builtin:text")).toBeNull();
    expect(parseSnippetRef("builtin:base")).toBeNull();
  });

  it("rejects empty or malformed references", () => {
    expect(parseSnippetRef("")).toBeNull();
    expect(parseSnippetRef("   ")).toBeNull();
    expect(parseSnippetRef("user:")).toBeNull();
    expect(parseSnippetRef("other:mine")).toBeNull();
  });
});

describe("resolveSnippetRefs", () => {
  it("normalises bare names to the user prefix", () => {
    expect(resolveSnippetRefs(["mine", "user:other"])).toEqual(["user:mine", "user:other"]);
  });

  it("deduplicates the two spellings of the same snippet", () => {
    // 不归一化就会被当成两条引用，同一份 CSS 挂两遍
    expect(resolveSnippetRefs(["mine", "user:mine"])).toEqual(["user:mine"]);
  });

  it("keeps the first-seen order", () => {
    expect(resolveSnippetRefs(["b", "a", "user:b"])).toEqual(["user:b", "user:a"]);
  });

  it("drops references that no longer resolve", () => {
    expect(resolveSnippetRefs(["builtin:text", "", "  ", "other:x"])).toEqual([]);
    expect(resolveSnippetRefs(["builtin:text", "mine"])).toEqual(["user:mine"]);
  });

  it("returns an empty list for an empty css field", () => {
    expect(resolveSnippetRefs([])).toEqual([]);
  });
});

describe("SnippetRegistry.read", () => {
  it("refuses a user reference that would escape the snippets directory", async () => {
    // 必须喂会记录路径的 adapter stub：只有这样才能把"守卫拦下了"和"读取本来就会失败"
    // 区分开——前者根本不该碰 adapter。
    const requested: string[] = [];
    const app = {
      vault: {
        // 配置目录字面量走不了 obsidianmd/hardcoded-config-path，故用中性值
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
    // 裸名也要走同一道守卫，否则新语义会开出一个绕过路径检查的口子
    await expect(snippets.read("../../secret")).resolves.toBeNull();
    // 关键断言：守卫拦下时根本不该去碰 adapter。
    expect(requested).toEqual([]);
  });
});
