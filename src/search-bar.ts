import {
  AbstractInputSuggest,
  prepareFuzzySearch,
  type App,
  type SearchResult,
} from "obsidian";
import type { CardHomeTabSettings, RecentFile } from "./settings";

export interface SearchCandidate {
  path: string;
  basename: string;
  kind: "file" | "bookmark" | "recent";
}

export function rememberRecentFile(
  settings: CardHomeTabSettings,
  path: string,
): RecentFile[] {
  const limit = Math.max(0, settings.maxRecentFiles);
  if (limit === 0) {
    return [];
  }
  const entry: RecentFile = { path, timestamp: Date.now() };
  return [entry, ...settings.recentFiles.filter((item) => item.path !== path)].slice(0, limit);
}

export async function readBookmarkPaths(app: App): Promise<string[]> {
  const path = `${app.vault.configDir}/bookmarks.json`;
  try {
    const raw = await app.vault.adapter.read(path);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return [];
    }
    const paths: string[] = [];
    collectFilePaths((parsed as { items?: unknown }).items, paths);
    return paths;
  } catch {
    return [];
  }
}

/**
 * 递归收集 `type: "file"` 的书签路径。
 *
 * 必须递归：Obsidian 的书签面板支持**分组**，分组节点长这样
 * `{ type: "group", items: [...] }`，文件书签就嵌在里面，而且可以多层嵌套。
 * 只扫顶层 `items` 的话，把书签整理进分组的用户会看到"显示书签"开着、
 * 却一条书签建议都没有，且没有任何提示。
 */
function collectFilePaths(items: unknown, into: string[]): void {
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as { type?: unknown; path?: unknown; items?: unknown };
    if (record.type === "file" && typeof record.path === "string") {
      into.push(record.path);
      continue;
    }
    if (record.type === "group") {
      collectFilePaths(record.items, into);
    }
  }
}

export function buildCandidates(
  app: App,
  settings: CardHomeTabSettings,
  bookmarkPaths: string[],
  recentPaths: string[],
): SearchCandidate[] {
  const available = new Map<string, SearchCandidate>();
  const files = settings.markdownOnly ? app.vault.getMarkdownFiles() : app.vault.getFiles();
  for (const file of files) {
    available.set(file.path, { path: file.path, basename: file.basename, kind: "file" });
  }

  const candidates: SearchCandidate[] = [];
  const seen = new Set<string>();
  const push = (path: string, kind: SearchCandidate["kind"]): void => {
    if (seen.has(path)) {
      return;
    }
    const found = available.get(path);
    if (!found) {
      return;
    }
    seen.add(path);
    candidates.push({ ...found, kind });
  };

  if (settings.showBookmarks) {
    for (const path of bookmarkPaths) {
      push(path, "bookmark");
    }
  }
  if (settings.showRecentFiles) {
    for (const path of recentPaths) {
      push(path, "recent");
    }
  }
  for (const candidate of available.values()) {
    if (!seen.has(candidate.path)) {
      seen.add(candidate.path);
      candidates.push(candidate);
    }
  }
  return candidates;
}

class CandidateSuggest extends AbstractInputSuggest<SearchCandidate> {
  private readonly candidates: SearchCandidate[];
  private readonly emptyState: SearchCandidate[];
  private readonly showPath: boolean;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    candidates: SearchCandidate[],
    emptyState: SearchCandidate[],
    showPath: boolean,
    limit: number,
  ) {
    super(app, inputEl);
    this.candidates = candidates;
    this.emptyState = emptyState;
    this.showPath = showPath;
    this.limit = limit;
  }

  protected getSuggestions(query: string): SearchCandidate[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return this.emptyState;
    }
    const match = prepareFuzzySearch(trimmed);
    const scored: { candidate: SearchCandidate; score: number }[] = [];
    for (const candidate of this.candidates) {
      const result: SearchResult | null = match(candidate.path);
      if (result) {
        scored.push({ candidate, score: result.score });
      }
    }
    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, this.limit).map((entry) => entry.candidate);
  }

  renderSuggestion(candidate: SearchCandidate, el: HTMLElement): void {
    const title = el.createDiv({ cls: "home-tab-suggestion-title" });
    title.createSpan({ text: candidate.basename });
    if (candidate.kind !== "file") {
      title.createSpan({
        cls: "home-tab-suggestion-tag",
        text: candidate.kind === "bookmark" ? "书签" : "最近",
      });
    }
    if (this.showPath) {
      el.createDiv({ cls: "home-tab-suggestion-path", text: candidate.path });
    }
  }
}

export function renderSearchBar(
  root: HTMLElement,
  app: App,
  settings: CardHomeTabSettings,
  candidates: SearchCandidate[],
  emptyState: SearchCandidate[],
  onOpen: (candidate: SearchCandidate, newLeaf: boolean) => void,
): () => void {
  const wrapper = root.createDiv({ cls: "home-tab-search" });
  const input = wrapper.createEl("input", {
    cls: "home-tab-search-input",
    attr: { type: "text", placeholder: "搜索笔记…" },
  });

  const suggest = new CandidateSuggest(
    app,
    input,
    candidates,
    emptyState,
    settings.showPath,
    settings.maxResults,
  );
  suggest.onSelect((candidate, event) => {
    input.value = "";
    onOpen(candidate, event.ctrlKey || event.metaKey);
  });

  // 必须把关闭动作交回调用方。`AbstractInputSuggest` 会在自己那侧挂一个弹出层，
  // 而 HomeView 每次重渲染都会 `root.empty()` 掉输入框——DOM 节点没了，suggest 实例
  // 却还活着，弹出的列表就可能留在页面上。返回一个清理函数，由视图在重渲染/关闭时调用。
  return () => {
    suggest.close();
  };
}
