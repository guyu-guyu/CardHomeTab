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
    const found = this.app.vault.getAbstractFileByPath(this.path);
    return found instanceof TFile ? found : null;
  }

  private get vault(): Vault {
    return this.app.vault;
  }

  exists(): boolean {
    return this.file !== null;
  }

  async create(): Promise<void> {
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
    await this.vault.create(path, "");
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
