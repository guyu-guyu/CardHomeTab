import { describe, expect, it } from "vitest";
import { parseDashboard, sectionBody } from "../src/dashboard/parse";

describe("parseDashboard", () => {
  it("returns an empty list when there is no heading at the target level", () => {
    expect(parseDashboard("# 只有一级标题\n正文\n", 2)).toEqual([]);
    expect(parseDashboard("没有标题\n", 2)).toEqual([]);
    expect(parseDashboard("", 2)).toEqual([]);
  });

  it("splits on the configured heading level only", () => {
    const text = ["# 页首", "## 一", "内容一", "### 更深，不切分", "还是内容一", "## 二", "内容二", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["一", "二"]);
    expect(sectionBody(text, sections[0]!)).toContain("### 更深，不切分");
    expect(sectionBody(text, sections[1]!)).toBe("内容二\n");
  });

  it("does not split on headings inside fenced code blocks", () => {
    const text = [
      "## 代码卡",
      "```md",
      "## 这行不是标题",
      "~~~",
      "## 这行也不是",
      "```",
      "尾部",
      "## 第二张",
      "内容",
      "",
    ].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["代码卡", "第二张"]);
    expect(sectionBody(text, sections[0]!)).toContain("## 这行不是标题");
  });

  it("closes a fence only with a matching character and enough length", () => {
    const text = ["## 卡", "````", "~~~", "```", "still inside", "````", "## 下一张", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["卡", "下一张"]);
    expect(sectionBody(text, sections[0]!)).toContain("still inside");
  });

  it("keeps a fence open to the end of the file", () => {
    const text = ["## 卡", "```", "## 未闭合也不是标题", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["卡"]);
  });

  it("skips YAML frontmatter", () => {
    const text = ["---", "title: 首页", "## 不是卡片", "---", "## 真卡片", "内容", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["真卡片"]);
  });

  it("ends a card at a higher-level heading", () => {
    const text = ["## 卡", "内容", "# 中断", "被排除", "## 下一张", ""].join("\n");
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["卡", "下一张"]);
    expect(sectionBody(text, sections[0]!)).not.toContain("被排除");
  });

  it("reads the metadata line directly after the heading", () => {
    const text = ["## 卡", "%%card: css=base; span=2%%", "内容", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.meta.css).toEqual(["base"]);
    expect(section!.meta.span).toBe(2);
    expect(sectionBody(text, section!)).toBe("内容\n");
  });

  it("only accepts the metadata line as the first non-empty line", () => {
    const text = ["## 卡", "先有内容", "%%card: css=base%%", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.meta.css).toEqual([]);
    expect(section!.metaRange).toBeNull();
    expect(sectionBody(text, section!)).toContain("%%card: css=base%%");
  });

  it("allows blank lines between the heading and the metadata line", () => {
    const text = ["## 卡", "", "%%card: css=base%%", "内容", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.meta.css).toEqual(["base"]);
    expect(sectionBody(text, section!)).toBe("内容\n");
  });

  it("does not treat a metadata line inside a code block as metadata", () => {
    const text = ["## 卡", "```", "%%card: css=base%%", "```", ""].join("\n");
    const [section] = parseDashboard(text, 2);
    expect(section!.metaRange).toBeNull();
    expect(section!.meta.css).toEqual([]);
  });

  it("reports byte-accurate ranges", () => {
    const text = ["前言", "## 甲", "正文甲", "## 乙", "正文乙"].join("\n");
    const sections = parseDashboard(text, 2);
    const [first, second] = sections;
    expect(text.slice(first!.start, first!.end)).toBe("## 甲\n正文甲\n");
    expect(text.slice(second!.start, second!.end)).toBe("## 乙\n正文乙");
    expect(first!.bodyStart).toBe(text.indexOf("正文甲"));
  });

  it("gives the last section the end of the file", () => {
    const text = "## 唯一\n内容\n";
    const [section] = parseDashboard(text, 2);
    expect(section!.end).toBe(text.length);
  });

  it("indexes sections from zero in file order", () => {
    const text = ["## 甲", "## 乙", "## 丙", ""].join("\n");
    expect(parseDashboard(text, 2).map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("honours a custom heading level", () => {
    const text = ["## 不是卡片", "### 是卡片", "内容", ""].join("\n");
    const sections = parseDashboard(text, 3);
    expect(sections.map((s) => s.title)).toEqual(["是卡片"]);
  });

  it("rejects headings without a space after the hashes", () => {
    expect(parseDashboard("##没有空格\n", 2)).toEqual([]);
  });

  it("strips a closing sequence of hashes from the title", () => {
    const sections = parseDashboard("## 标题 ##\n", 2);
    expect(sections[0]!.title).toBe("标题");
  });

  it("accepts up to three leading spaces", () => {
    expect(parseDashboard("   ## 缩进标题\n", 2).map((s) => s.title)).toEqual(["缩进标题"]);
    expect(parseDashboard("    ## 四格不算标题\n", 2)).toEqual([]);
  });

  it("parses an empty section with no body", () => {
    const text = "## 空卡片\n## 下一张\n";
    const sections = parseDashboard(text, 2);
    expect(sections.map((s) => s.title)).toEqual(["空卡片", "下一张"]);
    expect(sectionBody(text, sections[0]!)).toBe("");
  });
});
