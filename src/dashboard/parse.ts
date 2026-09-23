import { isFenceClosing, matchFenceOpening, type Fence } from "../fences";
import { parseCardMeta, serializeCardMeta, type CardMeta } from "./metadata";

export interface CardSection {
  index: number;
  title: string;
  meta: CardMeta;
  start: number;
  end: number;
  bodyStart: number;
  metaRange: { start: number; end: number } | null;
}

interface Line {
  text: string;
  start: number;
  end: number;
}

// 匹配用的 line.text 会剥掉行尾的 \r：JS 正则的 `.` 不匹配 \r（它是行终止符），
// 所以 "## 甲\r" 会让 /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/ 永远到不了 $，
// headingMatch 返回 null，整篇 CRLF 文档会一张卡片都解析不出来（且完全静默）。
// 不要“简化”掉这里的 replace —— 它只清洗匹配文本，start/end 仍指向原文，
// 保证 sectionBody 等按偏移切片的地方依旧返回带 \r\n 的原字节。
//
// 第 0 行还要另外剥掉行首的 BOM：frontmatterEnd 用 `.trim()` 顺带容忍了它，而
// headingMatch 的正则不会，于是「带 BOM 且首行就是标题」的文件会静默少一张卡片。
// 与 \r 同理，这里只清洗匹配文本，偏移不动，所以不必担心切片错位。
function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines.push({ text: text.slice(start, i).replace(/\r$/, ""), start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < text.length) {
    lines.push({ text: text.slice(start).replace(/\r$/, ""), start, end: text.length });
  }
  const first = lines[0];
  if (first) {
    first.text = first.text.replace(/^\uFEFF/, "");
  }
  return lines;
}

function headingMatch(line: string): { level: number; title: string } | null {
  const match = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(line);
  if (!match) {
    return null;
  }
  const title = (match[2] ?? "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();
  return { level: match[1]!.length, title };
}

function frontmatterEnd(lines: Line[]): number {
  const first = lines[0];
  if (!first || first.text.trim() !== "---") {
    return -1;
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.text.trim() === "---") {
      return i;
    }
  }
  return -1;
}

function freshMeta(): CardMeta {
  return { css: [], span: 1, col: 0, icon: "", entries: [] };
}

export function parseDashboard(text: string, headingLevel: number): CardSection[] {
  const lines = toLines(text);
  const skipThrough = frontmatterEnd(lines);
  const sections: CardSection[] = [];
  const headingLineIndex = new Map<CardSection, number>();

  let fence: Fence | null = null;
  let current: CardSection | null = null;

  const closeCurrent = (end: number): void => {
    if (current) {
      current.end = end;
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i <= skipThrough) {
      continue;
    }
    if (fence) {
      if (isFenceClosing(fence, line.text)) {
        fence = null;
      }
      continue;
    }
    const opening = matchFenceOpening(line.text);
    if (opening) {
      fence = opening.fence;
      continue;
    }
    const heading = headingMatch(line.text);
    if (!heading || heading.level > headingLevel) {
      continue;
    }
    closeCurrent(line.start);
    if (heading.level < headingLevel) {
      continue;
    }
    const section: CardSection = {
      index: sections.length,
      title: heading.title,
      meta: freshMeta(),
      start: line.start,
      end: text.length,
      bodyStart: line.end,
      metaRange: null,
    };
    sections.push(section);
    headingLineIndex.set(section, i);
    current = section;
  }
  closeCurrent(text.length);

  for (const section of sections) {
    const headingIndex = headingLineIndex.get(section)!;
    for (let j = headingIndex + 1; j < lines.length; j++) {
      const line = lines[j]!;
      if (line.start >= section.end) {
        break;
      }
      if (line.text.trim().length === 0) {
        continue;
      }
      if (matchFenceOpening(line.text)) {
        break;
      }
      const meta = parseCardMeta(line.text);
      if (meta) {
        section.meta = meta;
        section.metaRange = { start: line.start, end: line.end };
        section.bodyStart = line.end;
      }
      break;
    }
  }
  return sections;
}

export function sectionBody(text: string, section: CardSection): string {
  return text.slice(section.bodyStart, section.end);
}

/**
 * 判断"弹窗/渲染时手里的 section"和"重新解析出来的 section"是不是同一张卡。
 *
 * 只按 `start` 找是不行的：卡片首尾相接，删掉第 k 张之后第 k+1 张的 `start`
 * 恰好等于第 k 张原来的 `start`，于是按偏移查找会命中**下一张卡**，
 * 把已删除卡片的设置写进继任者，并覆盖对方手写的 `%%card: %%` 行。
 */
export function isSameSection(opened: CardSection, current: CardSection): boolean {
  return (
    opened.title === current.title &&
    serializeCardMeta(opened.meta) === serializeCardMeta(current.meta)
  );
}
