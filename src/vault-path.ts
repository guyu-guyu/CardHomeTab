/**
 * 把用户填的路径整理成 Obsidian 的库内路径形式。
 *
 * `getAbstractFileByPath` 是精确匹配，而 `Vault.create` 会把路径规范化后再落盘。
 * 两者不一致时会出现很难查的现象：用户填了 `./Home.md`，`exists()` 永远为 false，
 * 首页一直显示"文件缺失"，点"创建并打开"也修不好——因为文件其实已经被创建成
 * `Home.md` 了。所以这里在进入 store 之前就把路径统一掉。
 */
export function normalizeVaultPath(raw: string): string {
  const unified = raw.trim().replace(/\\/g, "/");
  const segments: string[] = [];
  for (const segment of unified.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}
