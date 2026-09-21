import { Modal, type App } from "obsidian";

/** 破坏性操作前的二次确认。Modal 自带焦点陷阱与 Esc 关闭，比 window.confirm 更符合 Obsidian 的观感。 */
export class ConfirmModal extends Modal {
  private readonly message: string;
  private readonly confirmLabel: string;
  private readonly onConfirm: () => void;

  constructor(app: App, message: string, confirmLabel: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    const footer = this.contentEl.createDiv({ cls: "home-tab-setting-footer" });
    const cancel = footer.createEl("button", { text: "取消" });
    cancel.addEventListener("click", () => this.close());
    const confirm = footer.createEl("button", { text: this.confirmLabel, cls: "mod-warning" });
    confirm.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
