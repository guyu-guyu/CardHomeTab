import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARD_META,
  isAutoCss,
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
      serializeCardMeta({ css: ["base", "text"], span: 2, icon: "lucide-chart", entries: [] }),
    ).toBe("%%card: css=base,text; span=2; icon=lucide-chart%%");
  });

  it("appends unknown keys after known ones", () => {
    expect(
      serializeCardMeta({ css: ["base"], span: 1, icon: "", entries: [{ key: "foo", value: "bar" }] }),
    ).toBe("%%card: css=base; foo=bar%%");
  });

  it("omits span when it is the default", () => {
    expect(serializeCardMeta({ css: [], span: 1, icon: "lucide-star", entries: [] })).toBe(
      "%%card: icon=lucide-star%%",
    );
  });

  it("round-trips through parse", () => {
    const cases = [
      "%%card: css=auto%%",
      "%%card: css=base,text; span=3; icon=lucide-chart; foo=bar%%",
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

describe("isAutoCss / isDefaultMeta", () => {
  it("detects the auto marker", () => {
    expect(isAutoCss(parseCardMeta("%%card: css=auto%%")!)).toBe(true);
    expect(isAutoCss(parseCardMeta("%%card: css=auto,text%%")!)).toBe(false);
    expect(isAutoCss(DEFAULT_CARD_META)).toBe(false);
  });

  it("detects fully default meta", () => {
    expect(isDefaultMeta(DEFAULT_CARD_META)).toBe(true);
    expect(isDefaultMeta(parseCardMeta("%%card: span=2%%")!)).toBe(false);
  });
});
