import { isFenceClosing, matchFenceOpening, type Fence } from "./fences";
import { AUTO_CSS, type CardMeta } from "./dashboard/metadata";

export const BUILTIN_SNIPPET_NAMES = ["code", "base", "query", "dataview", "text"] as const;

const ORDER = ["text", "code", "base", "query", "dataview"];

const CONTENT_LANGUAGES: Record<string, string> = {
  base: "base",
  query: "query",
  dataview: "dataview",
  dataviewjs: "dataview",
};

const BASE_EMBED_PATTERN = /!\[\[[^\]]*\.base(\|[^\]]*)?\]\]/i;

export function detectContentSnippets(markdown: string): string[] {
  const found = new Set<string>(["text"]);
  let fence: Fence | null = null;

  for (const line of markdown.split("\n")) {
    if (fence) {
      if (isFenceClosing(fence, line)) {
        fence = null;
      }
      continue;
    }
    const opening = matchFenceOpening(line);
    if (opening) {
      const language = opening.info.toLowerCase();
      found.add("code");
      const mapped = CONTENT_LANGUAGES[language];
      if (mapped) {
        found.add(mapped);
      }
      fence = opening.fence;
      continue;
    }
    if (BASE_EMBED_PATTERN.test(line)) {
      found.add("base");
    }
  }

  return ORDER.filter((name) => found.has(name));
}

export function resolveSnippetRefs(meta: CardMeta, markdown: string): string[] {
  if (meta.css.length === 0) {
    return [];
  }
  const refs: string[] = [];
  const seen = new Set<string>();
  const push = (ref: string): void => {
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  };
  for (const entry of meta.css) {
    if (entry === AUTO_CSS) {
      for (const name of detectContentSnippets(markdown)) {
        push(`builtin:${name}`);
      }
      continue;
    }
    push(entry.includes(":") ? entry : `builtin:${entry}`);
  }
  return refs;
}
