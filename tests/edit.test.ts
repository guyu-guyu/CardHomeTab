import { describe, expect, it } from "vitest";
import { appendCard, moveCard, removeCard, updateCardMeta } from "../src/dashboard/edit";
import { parseCardMeta } from "../src/dashboard/metadata";
import { parseDashboard } from "../src/dashboard/parse";

const meta = (line: string) => parseCardMeta(line)!;

describe("updateCardMeta", () => {
  it("inserts a metadata line when the card has none", () => {
    const text = "## 卡\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: css=base%%"))).toBe(
      "## 卡\n%%card: css=base%%\n内容\n",
    );
  });

  it("replaces an existing metadata line", () => {
    const text = "## 卡\n%%card: css=base%%\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: span=2%%"))).toBe(
      "## 卡\n%%card: span=2%%\n内容\n",
    );
  });

  it("removes the metadata line when the new meta is empty", () => {
    const text = "## 卡\n%%card: css=base%%\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card:%%"))).toBe("## 卡\n内容\n");
  });

  it("keeps a blank line the user placed between heading and metadata", () => {
    const text = "## 卡\n\n%%card: css=base%%\n内容\n";
    const section = parseDashboard(text, 2)[0]!;
    expect(updateCardMeta(text, section, meta("%%card: css=text%%"))).toBe(
      "## 卡\n\n%%card: css=text%%\n内容\n",
    );
  });

  it("leaves every other card byte-identical", () => {
    const text = [
      "前言",
      "",
      "## 甲",
      "甲内容",
      "",
      "## 乙",
      "%%card: css=old%%",
      "乙内容",
      "",
      "## 丙",
      "丙内容",
    ].join("\n");
    const sections = parseDashboard(text, 2);
    const next = updateCardMeta(text, sections[1]!, meta("%%card: css=new; span=2%%"));
    expect(next).toBe(text.replace("%%card: css=old%%", "%%card: css=new; span=2%%"));
  });
});

describe("removeCard", () => {
  it("removes the heading, metadata and body", () => {
    const text = "## 甲\n%%card: css=base%%\n甲内容\n## 乙\n乙内容\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("## 乙\n乙内容\n");
  });

  it("keeps the text before the first card untouched", () => {
    const text = "# 页首\n\n## 甲\n内容\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("# 页首\n\n");
  });

  it("keeps page-level text that follows the removed card", () => {
    const text = "## 甲\n甲内容\n# 中断\n页级正文\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("# 中断\n页级正文\n");
  });

  it("removes the only card", () => {
    const text = "## 甲\n内容\n";
    expect(removeCard(text, parseDashboard(text, 2)[0]!)).toBe("");
  });

  it("does not touch the second card when removing the first", () => {
    const text = "## 甲\n甲内容\n## 乙\n%%card: css=base%%\n乙内容\n";
    const sections = parseDashboard(text, 2);
    expect(removeCard(text, sections[0]!)).toBe("## 乙\n%%card: css=base%%\n乙内容\n");
  });

  it("preserves CRLF bytes when removing a section", () => {
    const crlf = "## 甲\r\n正文甲\r\n## 乙\r\n正文乙\r\n";
    const sections = parseDashboard(crlf, 2);
    expect(removeCard(crlf, sections[0]!)).toBe("## 乙\r\n正文乙\r\n");
  });
});

describe("moveCard", () => {
  const text = ["# 页首", "", "## 甲", "甲内容", "## 乙", "乙内容", "## 丙", "丙内容", ""].join("\n");

  it("moves a card later", () => {
    const sections = parseDashboard(text, 2);
    expect(parseDashboard(moveCard(text, sections, 0, 2), 2).map((s) => s.title)).toEqual([
      "乙",
      "丙",
      "甲",
    ]);
  });

  it("moves a card earlier", () => {
    const sections = parseDashboard(text, 2);
    expect(parseDashboard(moveCard(text, sections, 2, 0), 2).map((s) => s.title)).toEqual([
      "丙",
      "甲",
      "乙",
    ]);
  });

  it("is a no-op for equal or out-of-range indexes", () => {
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 0)).toBe(text);
    expect(moveCard(text, sections, 5, 0)).toBe(text);
    expect(moveCard(text, sections, 0, 5)).toBe(text);
  });

  it("does not mutate the caller's section array", () => {
    const sections = parseDashboard(text, 2);
    moveCard(text, sections, 0, 2);
    expect(sections.map((s) => s.title)).toEqual(["甲", "乙", "丙"]);
  });

  it("preserves the leading page content", () => {
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 2).startsWith("# 页首\n\n")).toBe(true);
  });

  it("appends a trailing newline when the file had none", () => {
    const noTrailing = "## 甲\n甲内容\n## 乙\n乙内容";
    const sections = parseDashboard(noTrailing, 2);
    expect(moveCard(noTrailing, sections, 0, 1)).toBe("## 乙\n乙内容\n## 甲\n甲内容\n");
  });

  it("keeps the body of each card with its heading", () => {
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 1, 2)).toContain("## 丙\n丙内容\n## 乙\n乙内容\n");
  });

  it("preserves CRLF bytes when moving sections", () => {
    const crlf = "## 甲\r\n正文甲\r\n## 乙\r\n正文乙\r\n";
    const sections = parseDashboard(crlf, 2);
    expect(moveCard(crlf, sections, 0, 1)).toBe("## 乙\r\n正文乙\r\n## 甲\r\n正文甲\r\n");
  });

  it("keeps page-level text that sits between two cards", () => {
    const text = "## 甲\n甲内容\n# 中断\n页级正文\n## 乙\n乙内容\n";
    const sections = parseDashboard(text, 2);
    expect(moveCard(text, sections, 0, 1)).toBe(
      "## 乙\n乙内容\n# 中断\n页级正文\n## 甲\n甲内容\n",
    );
  });
});

describe("appendCard", () => {
  it("appends to an empty file", () => {
    expect(appendCard("", 2, "新卡片", meta("%%card:%%"), "内容")).toBe("## 新卡片\n内容\n");
  });

  it("appends a metadata line when present", () => {
    expect(appendCard("", 2, "新卡片", meta("%%card: css=base%%"), "内容")).toBe(
      "## 新卡片\n%%card: css=base%%\n内容\n",
    );
  });

  it("adds the missing newline before appending", () => {
    expect(appendCard("## 甲\n甲内容", 2, "乙", meta("%%card:%%"), "乙内容")).toBe(
      "## 甲\n甲内容\n## 乙\n乙内容\n",
    );
  });

  it("does not create a run of blank lines when the file already ends with one", () => {
    expect(appendCard("## 甲\n甲内容\n", 2, "乙", meta("%%card:%%"), "乙内容")).toBe(
      "## 甲\n甲内容\n## 乙\n乙内容\n",
    );
  });

  it("trims the provided body", () => {
    expect(appendCard("", 3, "新卡片", meta("%%card:%%"), "\n\n内容\n\n")).toBe(
      "### 新卡片\n内容\n",
    );
  });

  it("honours the heading level", () => {
    expect(appendCard("", 4, "深卡片", meta("%%card:%%"), "")).toBe("#### 深卡片\n");
  });

  it("produces a file that parses back to both cards", () => {
    const once = appendCard("", 2, "甲", meta("%%card:%%"), "甲内容");
    const twice = appendCard(once, 2, "乙", meta("%%card: css=base%%"), "乙内容");
    const sections = parseDashboard(twice, 2);
    expect(sections.map((s) => s.title)).toEqual(["甲", "乙"]);
    expect(sections[1]!.meta.css).toEqual(["base"]);
  });
});
