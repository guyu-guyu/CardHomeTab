import { serializeCardMeta, type CardMeta } from "./metadata";
import type { CardSection } from "./parse";

const NEWLINE = "\n";

function metaLine(meta: CardMeta): string {
  const line = serializeCardMeta(meta);
  return line.length > 0 ? `${line}${NEWLINE}` : "";
}

export function updateCardMeta(text: string, section: CardSection, meta: CardMeta): string {
  const line = metaLine(meta);
  if (section.metaRange) {
    return text.slice(0, section.metaRange.start) + line + text.slice(section.metaRange.end);
  }
  if (line.length === 0) {
    return text;
  }
  const needsSeparator =
    section.bodyStart > 0 && !text.startsWith(NEWLINE, section.bodyStart - 1);
  const separator = needsSeparator ? NEWLINE : "";
  return text.slice(0, section.bodyStart) + separator + line + text.slice(section.bodyStart);
}

export function removeCard(text: string, section: CardSection): string {
  return text.slice(0, section.start) + text.slice(section.end);
}

export function moveCard(text: string, sections: CardSection[], from: number, to: number): string {
  const ordered = [...sections].sort((left, right) => left.start - right.start);
  if (from === to || from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) {
    return text;
  }
  const blocks = ordered.map((section) => {
    const block = text.slice(section.start, section.end);
    return block.endsWith(NEWLINE) ? block : block + NEWLINE;
  });
  const moved = blocks.splice(from, 1)[0]!;
  blocks.splice(to, 0, moved);
  let result = "";
  let cursor = 0;
  // 按原 start/end 槽位回写，而不是把 blocks 直接拼接：卡片之间可能夹着不属于任何卡片的
  // 页级正文（例如文档中间的一级标题及其正文），这些字节不在任何 section 的 [start, end) 里。
  // 用 head + blocks.join("") + tail 重组会把它们整段删掉且没有任何报错，
  // 所以不要“简化”回拼接写法。
  for (let i = 0; i < ordered.length; i++) {
    const section = ordered[i]!;
    result += text.slice(cursor, section.start) + blocks[i]!;
    cursor = section.end;
  }
  return result + text.slice(cursor);
}

export function appendCard(
  text: string,
  headingLevel: number,
  title: string,
  meta: CardMeta,
  body: string,
): string {
  const heading = `${"#".repeat(headingLevel)} ${title}`;
  const trimmed = body.trim();
  const prefix = text.length === 0 || text.endsWith(NEWLINE) ? text : text + NEWLINE;
  const header = `${heading}${NEWLINE}${metaLine(meta)}`;
  return trimmed.length > 0 ? `${prefix}${header}${trimmed}${NEWLINE}` : `${prefix}${header}`;
}
