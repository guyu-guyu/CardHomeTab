import { dropTargetToNoteIndex, type DropTarget } from "../card-grid";
import { effectiveCol, effectiveSpan } from "../column-layout";
import { hasLossyTokens, serializeCardMeta, type CardMeta } from "./metadata";
import { parseDashboard, type CardSection } from "./parse";

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

/**
 * 把一次拖拽落点写成新的文本：固化所有未指定的列、写入被拖卡片的目标列、再按列内位置移动。
 *
 * 抽成纯函数是为了能单测——这一段有三个各自都会静默出错的地方：
 *   1. **固化**。未指定 `col` 的卡片靠「笔记序号 % 列数」回退，而本次移动会让后续卡片的序号
 *      集体位移、连带跳列。所以要顺手把它们此刻的实际列号写进文件。写入的就是当前的显示
 *      结果，所以视觉布局不变。
 *   2. **倒序写 meta**。`updateCardMeta` 会改变它之后所有内容的偏移，从前往后写第二张就会
 *      用到已经失效的偏移。从后往前写则前面的 section 偏移全都还有效，一次 parse 就够。
 *   3. **补偿**。`dropTargetToNoteIndex` 给的是**移除之前**的下标，而 `moveCard` 的 `to` 是
 *      **移除之后**的下标，往后拖时必须减 1，否则整体偏一格。
 *
 * `lossy` 为真表示有卡片的 `%%card:` 行含插件表示不了的内容，它们的列号被跳过了——但移动
 * 照常执行：整次拖拽失败比少写一个列号糟得多。
 */
export function applyColumnDrop(args: {
  text: string;
  sections: CardSection[];
  from: number;
  target: DropTarget;
  columns: number;
  /** 切卡片用的标题级别，重新解析时要用同一个值 */
  headingLevel: number;
}): { text: string; lossy: boolean } {
  const { text, sections, from, target, columns, headingLevel } = args;
  if (from < 0 || from >= sections.length) {
    return { text, lossy: false };
  }
  const total = Math.max(1, columns);
  // cols 用于固化（每张卡片此刻的起始列），placed 额外带上跨列数——落点判定必须知道
  // 宽卡片覆盖了哪些列，否则它在"顺带覆盖的那一列"里是不可见的。
  const cols = sections.map((section, index) =>
    effectiveCol(section.meta.col, index, total, section.meta.span),
  );
  const placed = sections.map((section, index) => ({
    col: cols[index]!,
    span: effectiveSpan(section.meta.span, total),
  }));
  const col = Math.min(Math.max(target.col, 1), total);

  let next = text;
  let lossy = false;
  for (let index = sections.length - 1; index >= 0; index--) {
    const section = sections[index]!;
    const desired = index === from ? col : section.meta.col > 0 ? section.meta.col : cols[index]!;
    if (section.meta.col === desired) {
      continue;
    }
    if (
      section.metaRange &&
      hasLossyTokens(next.slice(section.metaRange.start, section.metaRange.end))
    ) {
      lossy = true;
      continue;
    }
    next = updateCardMeta(next, section, { ...section.meta, col: desired });
  }

  const raw = dropTargetToNoteIndex(placed, { col, indexInCol: target.indexInCol });
  const to = raw > from ? raw - 1 : raw;
  if (to === from || to < 0 || to >= sections.length) {
    return { text: next, lossy };
  }
  // 写过 meta 之后偏移全变了，必须重新解析再移动
  return { text: moveCard(next, parseDashboard(next, headingLevel), from, to), lossy };
}
