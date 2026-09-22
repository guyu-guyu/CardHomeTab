import type { App } from "obsidian";

export interface SnippetInfo {
  ref: string;
  name: string;
  /** 用户片段总有对应文件，所以不再可能为 null（内置片段已移除） */
  path: string;
}

/**
 * 把一条片段引用解析成用户片段的名字，解析不出来返回 null。
 *
 * 片段只剩「用户片段」一种来源，所以**裸名就是用户片段**：`mine` 等价于 `user:mine`。
 * `user:` 前缀继续接受（旧笔记与设置弹窗写出来的都是这个形式）。`builtin:` 已随内置
 * 片段一起废除，和其他任何前缀一样按无效处理——存量 `css=builtin:text` 于是静默失效，
 * 这是有意的：那种引用如今指向不存在的东西，留着只会是个永不生效又看不见的配置。
 */
export function parseSnippetRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const separator = trimmed.indexOf(":");
  if (separator < 0) {
    return trimmed;
  }
  if (trimmed.slice(0, separator).trim() !== "user") {
    return null;
  }
  const name = trimmed.slice(separator + 1).trim();
  return name.length > 0 ? name : null;
}

/**
 * 把 `%%card:` 里的 `css` 列表归一化成去重后的 `user:` 引用，保持首次出现的顺序。
 *
 * 归一化这一步不能省：同一个片段可以写成 `mine` 或 `user:mine`，不归一化就会被当成两条
 * 引用、同一份 CSS 挂两遍。无效项（空串、`builtin:x`、别的前缀）在这里静默丢弃。
 */
export function resolveSnippetRefs(css: readonly string[]): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const entry of css) {
    const name = parseSnippetRef(entry);
    if (name === null) {
      continue;
    }
    const ref = `user:${name}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
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
    // 与 read() 用同一道守卫：read() 会拒绝含分隔符或 `..` 的名字，若 list() 照单全收，
    // `my..card` 这类文件就会出现在设置页与卡片弹窗里，选中后静默失效。
    // filter 已经返回新数组，不必再 slice 一次就能安全 sort。
    return (this.userNames ?? [])
      .filter(isSafeSnippetName)
      .sort()
      .map((name) => ({
        ref: `user:${name}`,
        name,
        path: `${this.directory}/${name}.css`,
      }));
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
    const name = parseSnippetRef(ref);
    if (name === null || !isSafeSnippetName(name)) {
      return null;
    }
    const path = `${this.directory}/${name}.css`;
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
