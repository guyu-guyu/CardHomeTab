export function cardScopeSelector(cardId: string): string {
  return `.home-card.home-card[data-card-id="${cardId}"]`;
}

const IMPORT_PATTERN = /@import\b/i;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const ROOT_PATTERN = /(^|[{};,])(\s*):root\b/g;

function stripComments(css: string): string {
  return css.replace(COMMENT_PATTERN, " ");
}

export function containsImport(css: string): boolean {
  return IMPORT_PATTERN.test(stripComments(css));
}

function rewriteRoot(css: string): string {
  return css.replace(ROOT_PATTERN, (_match, prefix: string, spacing: string) => {
    if (spacing.length > 0) {
      return `${prefix}${spacing}:scope`;
    }
    return prefix.length > 0 ? `${prefix} :scope` : ":scope";
  });
}

export function scopeSnippet(css: string, cardId: string): string {
  const trimmed = css.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (containsImport(trimmed)) {
    console.warn("[CardHomeTab] CSS snippet rejected: @import is not allowed");
    return "";
  }
  return `@scope (${cardScopeSelector(cardId)}) {\n${rewriteRoot(trimmed)}\n}`;
}

export function scopedStylesheet(parts: { ref: string; css: string }[], cardId: string): string {
  const blocks: string[] = [];
  for (const part of parts) {
    const scoped = scopeSnippet(part.css, cardId);
    if (scoped.length > 0) {
      blocks.push(`/* ${part.ref} */\n${scoped}`);
    }
  }
  return blocks.join("\n");
}
