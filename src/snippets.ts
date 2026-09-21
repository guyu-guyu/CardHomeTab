import type { App } from "obsidian";
import baseCss from "./builtin-snippets/base.css";
import codeCss from "./builtin-snippets/code.css";
import dataviewCss from "./builtin-snippets/dataview.css";
import queryCss from "./builtin-snippets/query.css";
import textCss from "./builtin-snippets/text.css";

export interface SnippetInfo {
  ref: string;
  name: string;
  source: "builtin" | "user";
  path: string | null;
}

export const BUILTIN_SNIPPETS: Record<string, string> = {
  base: baseCss,
  code: codeCss,
  dataview: dataviewCss,
  query: queryCss,
  text: textCss,
};

export function parseSnippetRef(ref: string): { source: "builtin" | "user"; name: string } | null {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const separator = trimmed.indexOf(":");
  if (separator < 0) {
    return { source: "builtin", name: trimmed };
  }
  const source = trimmed.slice(0, separator).trim();
  const name = trimmed.slice(separator + 1).trim();
  if (name.length === 0) {
    return null;
  }
  if (source === "builtin") {
    return { source: "builtin", name };
  }
  if (source === "user") {
    return { source: "user", name };
  }
  return null;
}

interface CacheEntry {
  mtime: number;
  css: string;
}

/** 片段名会被拼进文件路径，拒绝分隔符与上级引用，避免 `user:../../x` 读到 snippets 目录之外 */
function isSafeSnippetName(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

export class SnippetRegistry {
  private readonly app: App;
  private userNames: string[] | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(app: App) {
    this.app = app;
  }

  get directory(): string {
    return `${this.app.vault.configDir}/snippets`;
  }

  list(): SnippetInfo[] {
    const builtin: SnippetInfo[] = Object.keys(BUILTIN_SNIPPETS)
      .sort()
      .map((name) => ({ ref: `builtin:${name}`, name, source: "builtin" as const, path: null }));
    // 与 read() 用同一道守卫：read() 会拒绝含分隔符或 `..` 的名字，若 list() 照单全收，
    // `my..card` 这类文件就会出现在设置页与卡片弹窗里，选中后静默失效。
    const user: SnippetInfo[] = (this.userNames ?? [])
      .filter(isSafeSnippetName)
      .slice()
      .sort()
      .map((name) => ({
        ref: `user:${name}`,
        name,
        source: "user" as const,
        path: `${this.directory}/${name}.css`,
      }));
    return [...builtin, ...user];
  }

  invalidate(): void {
    this.userNames = null;
    this.cache.clear();
  }

  async ensureUserNames(): Promise<void> {
    if (this.userNames !== null) {
      return;
    }
    try {
      const listing = await this.app.vault.adapter.list(this.directory);
      this.userNames = listing.files
        .filter((file) => file.toLowerCase().endsWith(".css"))
        .map((file) => file.slice(file.lastIndexOf("/") + 1, -4));
    } catch {
      this.userNames = [];
    }
  }

  async read(ref: string): Promise<string | null> {
    const parsed = parseSnippetRef(ref);
    if (!parsed) {
      return null;
    }
    if (parsed.source === "builtin") {
      return Object.hasOwn(BUILTIN_SNIPPETS, parsed.name)
        ? (BUILTIN_SNIPPETS[parsed.name] ?? null)
        : null;
    }
    if (!isSafeSnippetName(parsed.name)) {
      return null;
    }
    const path = `${this.directory}/${parsed.name}.css`;
    try {
      const stat = await this.app.vault.adapter.stat(path);
      const mtime = stat?.mtime ?? 0;
      const cached = this.cache.get(path);
      if (cached && cached.mtime === mtime) {
        return cached.css;
      }
      const css = await this.app.vault.adapter.read(path);
      this.cache.set(path, { mtime, css });
      return css;
    } catch {
      return null;
    }
  }

  async resolveAll(refs: string[]): Promise<{ ref: string; css: string }[]> {
    const resolved: { ref: string; css: string }[] = [];
    for (const ref of refs) {
      resolved.push({ ref, css: (await this.read(ref)) ?? "" });
    }
    return resolved;
  }
}
