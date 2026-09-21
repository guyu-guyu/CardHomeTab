import type { App } from "obsidian";
import type { CardHomeTabSettings } from "./settings";

export function resolveAssetSource(
  app: App,
  type: "vaultImage" | "url",
  value: string,
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (type === "url") {
    return trimmed;
  }
  const file = app.metadataCache.getFirstLinkpathDest(trimmed, "");
  return file ? app.vault.getResourcePath(file) : null;
}

export function renderBackground(
  root: HTMLElement,
  app: App,
  settings: CardHomeTabSettings,
): void {
  if (settings.backgroundType === "none") {
    return;
  }
  // 用背景层所在文档而不是全局 document：视图被「移到新窗口」后 root 属于 popout 文档，
  // 全局 document.body 的主题类可能与 popout 不一致，导致 popout 里取错亮/暗背景。
  const isDark = root.ownerDocument.body.hasClass("theme-dark");
  const preferred = isDark ? settings.backgroundDark : settings.backgroundLight;
  const fallback = isDark ? settings.backgroundLight : settings.backgroundDark;
  const source =
    resolveAssetSource(app, settings.backgroundType, preferred) ??
    resolveAssetSource(app, settings.backgroundType, fallback);
  if (!source) {
    return;
  }

  const bleed = settings.backgroundBlur * 2;
  const layer = root.createDiv({ cls: "home-tab-background" });
  layer.style.backgroundImage = `url("${source}")`;
  if (settings.backgroundBlur > 0) {
    layer.style.filter = `blur(${settings.backgroundBlur}px)`;
    layer.style.inset = `-${bleed}px`;
  }
  if (settings.backgroundDim > 0) {
    const veil = root.createDiv({ cls: "home-tab-background-veil" });
    veil.style.backgroundColor = `rgba(0, 0, 0, ${settings.backgroundDim / 100})`;
    // 遮罩必须和背景图一样外扩，否则模糊溢出的那一圈是**没被压暗**的，
    // 图片四周会出现一圈比中间更亮的边。
    if (bleed > 0) {
      veil.style.inset = `-${bleed}px`;
    }
  }
}
