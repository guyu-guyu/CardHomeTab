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
  const isDark = document.body.hasClass("theme-dark");
  const preferred = isDark ? settings.backgroundDark : settings.backgroundLight;
  const fallback = isDark ? settings.backgroundLight : settings.backgroundDark;
  const source = resolveAssetSource(
    app,
    settings.backgroundType,
    preferred.trim().length > 0 ? preferred : fallback,
  );
  if (!source) {
    return;
  }

  const layer = root.createDiv({ cls: "home-tab-background" });
  layer.style.backgroundImage = `url("${source}")`;
  if (settings.backgroundBlur > 0) {
    layer.style.filter = `blur(${settings.backgroundBlur}px)`;
    layer.style.inset = `-${settings.backgroundBlur * 2}px`;
  }
  if (settings.backgroundDim > 0) {
    const veil = root.createDiv({ cls: "home-tab-background-veil" });
    veil.style.backgroundColor = `rgba(0, 0, 0, ${settings.backgroundDim / 100})`;
  }
}
