export function cardScopeSelector(cardId: string): string {
  return `.home-card.home-card[data-card-id="${cardId}"]`;
}

const IMPORT_PATTERN = /@import\b/i;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const ROOT_PATTERN = /(^|[{};,]|\*\/)(\s*):root\b/gi;

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

/** 标签只用于 devtools 里辨认来源，把非安全字符替换掉，避免 ref 里的注释结束符把自己的注释提前闭合 */
function labelFor(ref: string): string {
  return ref.replace(/[^\w:.-]/g, "_");
}

export function scopedStylesheet(parts: { ref: string; css: string }[], cardId: string): string {
  const blocks: string[] = [];
  for (const part of parts) {
    const scoped = scopeSnippet(part.css, cardId);
    if (scoped.length > 0) {
      blocks.push(`/* ${labelFor(part.ref)} */\n${scoped}`);
    }
  }
  return blocks.join("\n");
}
