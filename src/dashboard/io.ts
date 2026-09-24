import { TFile, type App, type Vault } from "obsidian";
import type { CardHomeTabSettings } from "../settings";
import { parseDashboard, type CardSection } from "./parse";
import { normalizeVaultPath } from "../vault-path";

const FALLBACK_PATH = "Home.md";

export class DashboardStore {
  private readonly app: App;
  private readonly getSettings: () => CardHomeTabSettings;

  constructor(app: App, getSettings: () => CardHomeTabSettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  get path(): string {
    return normalizeVaultPath(this.getSettings().dashboardFile) || FALLBACK_PATH;
  }

  get file(): TFile | null {
    const wanted = this.path;
    // 只认 Markdown。仪表盘路径是用户手填的自由文本，指到 .json / .canvas / .txt 上时，
    // 首页会把它当卡片笔记解析，而删卡、挪卡、改卡设置都会经 vault.process 把那个文件
    // **整体改写**成仪表盘内容——那是在改坏用户别的文件。返回 null 让它退化成"文件缺失"。
    if (!wanted.toLowerCase().endsWith(".md")) {
      return null;
    }
    const found = this.app.vault.getAbstractFileByPath(wanted);
    return found instanceof TFile ? found : null;
  }

  private get vault(): Vault {
    return this.app.vault;
  }

  exists(): boolean {
    return this.file !== null;
  }

  /**
   * 创建仪表盘文件。
   *
   * `content` 留给「新标签页首次打开」那条路径传默认内容；不传就是空文件（原有行为）。
   * 已经存在时直接返回，绝不覆盖——这是用户手填的路径，覆盖等于毁掉他的笔记。
   */
  async create(content = ""): Promise<void> {
    if (!this.path.toLowerCase().endsWith(".md")) {
      throw new Error(`仪表盘文件必须是 Markdown 笔记：${this.path}`);
    }
    if (this.exists()) {
      return;
    }
    const path = this.path;
    const separator = path.lastIndexOf("/");
    if (separator > 0) {
      const folder = path.slice(0, separator);
      if (!this.vault.getAbstractFileByPath(folder)) {
        try {
          await this.vault.createFolder(folder);
        } catch {
          // 文件夹可能已被并发创建，忽略
        }
      }
    }
    await this.vault.create(path, content);
  }

  async read(): Promise<string | null> {
    const file = this.file;
    if (!file) {
      return null;
    }
    return this.vault.cachedRead(file);
  }

  async sections(): Promise<CardSection[]> {
    const text = await this.read();
    if (text === null) {
      return [];
    }
    return parseDashboard(text, this.getSettings().cardHeadingLevel);
  }

  async process(mutate: (text: string) => string): Promise<void> {
    const file = this.file;
    if (!file) {
      throw new Error(`CardHomeTab: dashboard file not found: ${this.path}`);
    }
    await this.vault.process(file, mutate);
  }
}
