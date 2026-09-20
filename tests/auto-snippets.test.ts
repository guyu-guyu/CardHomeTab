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
});
