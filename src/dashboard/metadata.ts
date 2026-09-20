export interface CardMetaEntry {
  key: string;
  value: string;
}

export interface CardMeta {
  css: string[];
  span: number;
  icon: string;
  entries: CardMetaEntry[];
}

export const AUTO_CSS = "auto";

export const DEFAULT_CARD_META: CardMeta = {
  css: [],
  span: 1,
  icon: "",
  entries: [],
};

const LINE_PATTERN = /^\s*%%card:\s*([\s\S]*?)\s*%%\s*$/;

export function parseCardMeta(line: string): CardMeta | null {
  const match = LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const meta: CardMeta = { css: [], span: 1, icon: "", entries: [] };
  for (const rawPart of (match[1] ?? "").split(";")) {
    const part = rawPart.trim();
    if (part.length === 0) {
      continue;
    }
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key.length === 0) {
      continue;
    }
    if (key === "css") {
      meta.css = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    } else if (key === "span") {
      const parsed = Number.parseInt(value, 10);
      meta.span = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
    } else if (key === "icon") {
      meta.icon = value;
    } else {
      meta.entries.push({ key, value });
    }
  }
  return meta;
}

export function serializeCardMeta(meta: CardMeta): string {
  const parts: string[] = [];
  if (meta.css.length > 0) {
    parts.push(`css=${meta.css.join(",")}`);
  }
  if (meta.span > 1) {
    parts.push(`span=${meta.span}`);
  }
  if (meta.icon.length > 0) {
    parts.push(`icon=${meta.icon}`);
  }
  for (const entry of meta.entries) {
    parts.push(`${entry.key}=${entry.value}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `%%card: ${parts.join("; ")}%%`;
}

export function isAutoCss(meta: CardMeta): boolean {
  return meta.css.length === 1 && meta.css[0] === AUTO_CSS;
}

export function isDefaultMeta(meta: CardMeta): boolean {
  return (
    meta.css.length === 0 && meta.span <= 1 && meta.icon.length === 0 && meta.entries.length === 0
  );
}
