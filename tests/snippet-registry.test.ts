import { describe, expect, it } from "vitest";
import { BUILTIN_SNIPPETS, parseSnippetRef } from "../src/snippets";
import { BUILTIN_SNIPPET_NAMES } from "../src/auto-snippets";

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
    const selectors = (BUILTIN_SNIPPETS["query"] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("{") && !line.startsWith("@"));
    for (const selector of selectors) {
      expect(selector, `query must not style ${selector}`).not.toContain(".block-language-query");
    }
  });

  it("scopes every rule to the card content container", () => {
    for (const [name, css] of Object.entries(BUILTIN_SNIPPETS)) {
      const selectors = css
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith("{") && !line.startsWith("@"));
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
