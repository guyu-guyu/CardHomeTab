export interface CardMetaEntry {
  key: string;
  value: string;
}

export interface CardMeta {
  css: string[];
  span: number;
  /**
   * 卡片所在列（1-based）。`0` 表示未指定——此时由布局层按笔记顺序轮转回退。
   *
   * 必须是一等字段而不能走 `entries`：`entries` 是"原样保留未识别键"的口袋，同一个键
   * 写第二次就会在行里留下 `col=1; col=2`，而 `hasLossyTokens` 把重复键判为有损，
   * 于是这张卡的设置弹窗从此再也保存不进去。
   */
  col: number;
  icon: string;
  entries: CardMetaEntry[];
}

export const DEFAULT_CARD_META: CardMeta = {
  css: [],
  span: 1,
  col: 0,
  icon: "",
  entries: [],
};

const LINE_PATTERN = /^\s*%%card:\s*([\s\S]*?)\s*%%\s*$/;

export function parseCardMeta(line: string): CardMeta | null {
  const match = LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const meta: CardMeta = { css: [], span: 1, col: 0, icon: "", entries: [] };
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
    } else if (key === "col") {
      // 非法值回落到 0（未指定）而不是 1：回落成 1 会把这张卡硬钉在第一列，
      // 而"未指定"能让布局层按轮转给它一个合理的位置。
      const parsed = Number.parseInt(value, 10);
      meta.col = Number.isInteger(parsed) && parsed >= 1 ? parsed : 0;
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
  if (meta.col > 0) {
    parts.push(`col=${meta.col}`);
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

export function isDefaultMeta(meta: CardMeta): boolean {
  return (
    meta.css.length === 0 &&
    meta.span <= 1 &&
    meta.col <= 0 &&
    meta.icon.length === 0 &&
    meta.entries.length === 0
  );
}

/**
 * 判断一行 `%%card:` 里是否含有解析器会**丢弃或覆盖**的内容。
 *
 * 为什么需要它：`updateCardMeta` 是整行替换，所以解析阶段丢掉的东西会在写盘时
 * 变成真的丢字。Task 14 的卡片设置弹窗是第一个会把整行重新序列化写回去的地方，
 * 于是这几类手写内容会在"打开弹窗 → 点应用"之后静默消失，用户什么都没改：
 *   - 值里带分隔符：`note=a;b` 会被拆成 `note=a` 与孤立的 `b`，后者没有 `=` 被丢掉；
 *   - 没有 `=` 的孤立片段：`%%card: css=base; 说明文字%%` 里的 `说明文字`；
 *   - 重复的键：`css=base; css=text` 只能保留后一个。
 *
 * 注意**不能**用"重新序列化后与原文是否逐字相同"来判断：键的书写顺序会被规范化
 * （`foo=bar; span=2` 变成 `span=2; foo=bar`），那是等价重排，不是丢失。
 */
export function hasLossyTokens(line: string): boolean {
  const match = LINE_PATTERN.exec(line);
  if (!match) {
    return false;
  }
  const body = match[1] ?? "";
  const keys: string[] = [];
  for (const rawPart of body.split(";")) {
    const part = rawPart.trim();
    if (part.length === 0) {
      continue;
    }
    const separator = part.indexOf("=");
    if (separator <= 0) {
      return true;
    }
    keys.push(part.slice(0, separator).trim());
  }
  return new Set(keys).size !== keys.length;
}
