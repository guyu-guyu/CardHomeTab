import { isFenceClosing, matchFenceOpening, type Fence } from "../fences";
import { parseCardMeta, type CardMeta } from "./metadata";

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

function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      lines.push({ text: text.slice(start, i), start, end: i + 1 });
      start = i + 1;
    }
  }
  if (start < text.length) {
    lines.push({ text: text.slice(start), start, end: text.length });
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
  return { css: [], span: 1, icon: "", entries: [] };
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
