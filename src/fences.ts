export interface Fence {
  marker: string;
  length: number;
}

const OPENING_PATTERN = /^ {0,3}(`{3,}|~{3,})([^\s`~]*)/;

export function matchFenceOpening(line: string): { fence: Fence; info: string } | null {
  const match = OPENING_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const run = match[1]!;
  return { fence: { marker: run[0]!, length: run.length }, info: match[2] ?? "" };
}

export function isFenceClosing(fence: Fence, line: string): boolean {
  return new RegExp(`^ {0,3}\\${fence.marker}{${fence.length},}\\s*$`).test(line);
}
