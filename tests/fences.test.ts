import { describe, expect, it } from "vitest";
import { isFenceClosing, matchFenceOpening } from "../src/fences";

describe("matchFenceOpening", () => {
  it("matches backtick and tilde fences", () => {
    expect(matchFenceOpening("```")).toEqual({ fence: { marker: "`", length: 3 }, info: "" });
    expect(matchFenceOpening("~~~")).toEqual({ fence: { marker: "~", length: 3 }, info: "" });
  });

  it("captures the language info string", () => {
    expect(matchFenceOpening("```dataviewjs")).toEqual({
      fence: { marker: "`", length: 3 },
      info: "dataviewjs",
    });
  });

  it("accepts up to three leading spaces", () => {
    expect(matchFenceOpening("   ```js")).toEqual({
      fence: { marker: "`", length: 3 },
      info: "js",
    });
    expect(matchFenceOpening("    ```js")).toBeNull();
  });

  it("records the run length so longer fences can nest shorter ones", () => {
    expect(matchFenceOpening("````")).toEqual({ fence: { marker: "`", length: 4 }, info: "" });
  });

  it("rejects a fence marker that is not at the start of a line", () => {
    expect(matchFenceOpening("文字 ```base 文字")).toBeNull();
    expect(matchFenceOpening("`行内代码`")).toBeNull();
  });
});

describe("isFenceClosing", () => {
  const backtick3 = { marker: "`", length: 3 };

  it("accepts the same character with equal or greater length", () => {
    expect(isFenceClosing(backtick3, "```")).toBe(true);
    expect(isFenceClosing(backtick3, "````")).toBe(true);
  });

  it("rejects a shorter run or a different character", () => {
    expect(isFenceClosing(backtick3, "``")).toBe(false);
    expect(isFenceClosing(backtick3, "~~~")).toBe(false);
  });

  it("rejects trailing content", () => {
    expect(isFenceClosing(backtick3, "```js")).toBe(false);
  });

  it("allows trailing whitespace and leading indentation", () => {
    expect(isFenceClosing(backtick3, "  ```  ")).toBe(true);
  });
});
