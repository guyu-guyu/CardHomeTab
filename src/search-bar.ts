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

const MAX_FILE_SUGGESTIONS = 200;

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
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return [];
    }
    const paths: string[] = [];
    for (const item of items) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const record = item as { type?: unknown; path?: unknown };
      if (record.type === "file" && typeof record.path === "string") {
        paths.push(record.path);
      }
    }
    return paths;
  } catch {
    return [];
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
  ) {
    super(app, inputEl);
    this.candidates = candidates;
    this.emptyState = emptyState;
    this.showPath = showPath;
    this.limit = MAX_FILE_SUGGESTIONS;
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
): void {
  const wrapper = root.createDiv({ cls: "home-tab-search" });
  const input = wrapper.createEl("input", {
    cls: "home-tab-search-input",
    attr: { type: "text", placeholder: "搜索笔记…" },
  });

  const suggest = new CandidateSuggest(app, input, candidates, emptyState, settings.showPath);
  suggest.onSelect((candidate, event) => {
    input.value = "";
    onOpen(candidate, event.ctrlKey || event.metaKey);
  });
}
