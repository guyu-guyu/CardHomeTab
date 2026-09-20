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

  it("never relies on .block-language-query, which Obsidian does not emit", () => {
    // 只在选择器上断言：query.css 的注释里正当地提到了这个类名（就是为了说明它不存在），
    // 对整段 CSS 文本做子串匹配会把那句警告本身判成违规。
    for (const selector of selectorsOf(BUILTIN_SNIPPETS["query"] ?? "")) {
      expect(selector, `query must not style ${selector}`).not.toContain(".block-language-query");
    }
  });

  it("never relies on .search-result-file-path, which Obsidian does not emit", () => {
    for (const selector of selectorsOf(BUILTIN_SNIPPETS["query"] ?? "")) {
      expect(selector, `query must not style ${selector}`).not.toContain(".search-result-file-path");
    }
  });

  it("scopes every rule to the card content container", () => {
    for (const [name, css] of Object.entries(BUILTIN_SNIPPETS)) {
      const selectors = selectorsOf(css);
      expect(selectors.length, `${name} has no selectors`).toBeGreaterThan(0);
      for (const selector of selectors) {
        expect(selector, `${name} leaks outside the card: ${selector}`).toContain(
          ".home-card-content",
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

// 路径穿越那一条必须喂会记录路径的 adapter stub，而 builtin 那一条不必：
// `builtin:` 的读取根本不碰 adapter，`user:` 的读取才会，所以只有记录型 adapter 才能把
// "守卫拦下了" 和 "读取本来就会失败" 区分开。
describe("SnippetRegistry.read", () => {
  // `builtin:` 的读取不碰 adapter，所以这里可以只喂一个最小 stub；
  // 配置文件目录字面量走不了 obsidianmd/hardcoded-config-path，故用中性值。
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
