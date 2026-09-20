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
