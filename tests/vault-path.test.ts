import { describe, expect, it } from "vitest";
import { normalizeVaultPath } from "../src/vault-path";

describe("normalizeVaultPath", () => {
  it("leaves an ordinary path alone", () => {
    expect(normalizeVaultPath("Home.md")).toBe("Home.md");
    expect(normalizeVaultPath("子目录/Home.md")).toBe("子目录/Home.md");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeVaultPath("  Home.md  ")).toBe("Home.md");
  });

  it("strips leading slashes and dot segments", () => {
    expect(normalizeVaultPath("/Home.md")).toBe("Home.md");
    expect(normalizeVaultPath("./Home.md")).toBe("Home.md");
    expect(normalizeVaultPath(".//Home.md")).toBe("Home.md");
  });

  it("collapses repeated and trailing separators", () => {
    expect(normalizeVaultPath("a//b///Home.md")).toBe("a/b/Home.md");
    expect(normalizeVaultPath("a/b/")).toBe("a/b");
  });

  it("accepts windows separators", () => {
    expect(normalizeVaultPath("子目录\\Home.md")).toBe("子目录/Home.md");
    expect(normalizeVaultPath(".\\Home.md")).toBe("Home.md");
  });

  it("resolves parent references", () => {
    expect(normalizeVaultPath("a/b/../Home.md")).toBe("a/Home.md");
    expect(normalizeVaultPath("a/../../Home.md")).toBe("Home.md");
  });

  it("returns an empty string for input that resolves to nothing", () => {
    expect(normalizeVaultPath("")).toBe("");
    expect(normalizeVaultPath("   ")).toBe("");
    expect(normalizeVaultPath("/")).toBe("");
    expect(normalizeVaultPath(".")).toBe("");
  });
});
