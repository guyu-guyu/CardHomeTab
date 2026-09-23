import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARD_META,
  hasLossyTokens,
  isDefaultMeta,
  parseCardMeta,
  serializeCardMeta,
} from "../src/dashboard/metadata";

describe("parseCardMeta", () => {
  it("returns null for lines that are not card metadata", () => {
    expect(parseCardMeta("## 标题")).toBeNull();
    expect(parseCardMeta("普通文本")).toBeNull();
    expect(parseCardMeta("%% 只是注释 %%")).toBeNull();
    expect(parseCardMeta("%%card: css=text")).toBeNull();
  });

  it("parses an empty body into defaults", () => {
    expect(parseCardMeta("%%card:%%")).toEqual(DEFAULT_CARD_META);
  });

  it("parses every known key", () => {
    const meta = parseCardMeta("%%card: css=base,text; span=2; icon=lucide-chart%%");
    expect(meta).not.toBeNull();
    expect(meta!.css).toEqual(["base", "text"]);
    expect(meta!.span).toBe(2);
    expect(meta!.icon).toBe("lucide-chart");
    expect(meta!.entries).toEqual([]);
  });

  it("tolerates spacing", () => {
    const meta = parseCardMeta("%%card:  css = base ;  span = 3 %%");
    expect(meta!.css).toEqual(["base"]);
    expect(meta!.span).toBe(3);
  });

  it("falls back to defaults for malformed known values", () => {
    const meta = parseCardMeta("%%card: css=; span=abc; span=0%%");
    expect(meta!.css).toEqual([]);
    expect(meta!.span).toBe(1);
  });

  it("keeps unknown keys verbatim in order", () => {
    const meta = parseCardMeta("%%card: css=base; foo=bar; baz=a=b%%");
    expect(meta!.entries).toEqual([
      { key: "foo", value: "bar" },
      { key: "baz", value: "a=b" },
    ]);
  });

  it("ignores entries without a key", () => {
    const meta = parseCardMeta("%%card: css=base; =oops; ;%%");
    expect(meta!.entries).toEqual([]);
  });
});

describe("serializeCardMeta", () => {
  it("returns an empty string for default meta", () => {
    expect(serializeCardMeta(DEFAULT_CARD_META)).toBe("");
  });

  it("emits known keys in canonical order", () => {
    expect(
      serializeCardMeta({ css: ["base", "text"], span: 2, col: 0, icon: "lucide-chart", entries: [] }),
    ).toBe("%%card: css=base,text; span=2; icon=lucide-chart%%");
  });

  it("appends unknown keys after known ones", () => {
    expect(
      serializeCardMeta({ css: ["base"], span: 1, col: 0, icon: "", entries: [{ key: "foo", value: "bar" }] }),
    ).toBe("%%card: css=base; foo=bar%%");
  });

  it("omits span when it is the default", () => {
    expect(serializeCardMeta({ css: [], span: 1, col: 0, icon: "lucide-star", entries: [] })).toBe(
      "%%card: icon=lucide-star%%",
    );
  });

  it("round-trips through parse", () => {
    const cases = [
      "%%card: css=mine%%",
      "%%card: css=user:mine,other; span=3; icon=lucide-chart; foo=bar%%",
      "%%card: span=2%%",
      "%%card: icon=lucide-icon%%",
    ];
    for (const line of cases) {
      const parsed = parseCardMeta(line);
      expect(parsed).not.toBeNull();
      expect(serializeCardMeta(parsed!)).toBe(line);
    }
  });
});

describe("col", () => {
  it("parses an explicit column", () => {
    expect(parseCardMeta("%%card: col=2%%")!.col).toBe(2);
    expect(parseCardMeta("%%card: css=mine; span=2; col=3; icon=x%%")!.col).toBe(3);
  });

  it("defaults to 0, meaning unspecified", () => {
    // 0 而不是 1：未指定要让布局层按轮转给位置，回落成 1 会把卡片硬钉在第一列
    expect(parseCardMeta("%%card: span=2%%")!.col).toBe(0);
    expect(DEFAULT_CARD_META.col).toBe(0);
  });

  it("falls back to unspecified for an illegal value", () => {
    expect(parseCardMeta("%%card: col=abc%%")!.col).toBe(0);
    expect(parseCardMeta("%%card: col=0%%")!.col).toBe(0);
    expect(parseCardMeta("%%card: col=-2%%")!.col).toBe(0);
    expect(parseCardMeta("%%card: col=%%")!.col).toBe(0);
  });

  it("is a first-class field and never lands in entries", () => {
    // 走 entries 的话，第二次写入会留下 `col=1; col=2` 重复键，而 hasLossyTokens 把重复键
    // 判为有损，于是这张卡的设置弹窗从此再也保存不进去
    const meta = parseCardMeta("%%card: col=2%%")!;
    expect(meta.entries).toEqual([]);
    expect(serializeCardMeta({ ...meta, col: 3 })).toBe("%%card: col=3%%");
    expect(hasLossyTokens(serializeCardMeta({ ...meta, col: 3 }))).toBe(false);
  });

  it("is omitted when unspecified", () => {
    expect(serializeCardMeta({ css: [], span: 1, col: 0, icon: "", entries: [] })).toBe("");
    expect(serializeCardMeta({ css: [], span: 2, col: 0, icon: "", entries: [] })).toBe(
      "%%card: span=2%%",
    );
  });

  it("round-trips through parse", () => {
    for (const line of ["%%card: col=2%%", "%%card: span=2; col=3%%", "%%card: css=mine; col=1%%"]) {
      expect(serializeCardMeta(parseCardMeta(line)!)).toBe(line);
    }
  });
});

describe("isDefaultMeta", () => {
  it("treats an explicit column as non-default", () => {
    expect(isDefaultMeta(parseCardMeta("%%card: col=2%%")!)).toBe(false);
  });

  it("detects fully default meta", () => {
    expect(isDefaultMeta(DEFAULT_CARD_META)).toBe(true);
    expect(isDefaultMeta(parseCardMeta("%%card: span=2%%")!)).toBe(false);
  });
});

describe("hasLossyTokens", () => {
  it("accepts a line the parser can represent exactly", () => {
    expect(hasLossyTokens("%%card: css=base,text; span=2; icon=lucide-chart%%")).toBe(false);
    expect(hasLossyTokens("%%card:")).toBe(false);
  });

  it("accepts a key reordering, which is normalization rather than loss", () => {
    expect(hasLossyTokens("%%card: foo=bar; span=2%%")).toBe(false);
  });

  it("flags a value containing the separator", () => {
    expect(hasLossyTokens("%%card: css=base; note=a;b%%")).toBe(true);
  });

  it("flags a bare token without a key", () => {
    expect(hasLossyTokens("%%card: css=base; 说明文字%%")).toBe(true);
    expect(hasLossyTokens("%%card: =oops%%")).toBe(true);
  });

  it("flags a repeated key", () => {
    expect(hasLossyTokens("%%card: css=base; css=text%%")).toBe(true);
  });
});
