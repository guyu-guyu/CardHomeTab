import { setIcon, type App } from "obsidian";
import { resolveAssetSource } from "./background";
import type { CardHomeTabSettings } from "./settings";

export function renderHeader(
  root: HTMLElement,
  app: App,
  settings: CardHomeTabSettings,
): void {
  const hero = root.createDiv({ cls: "home-tab-hero" });

  if (settings.logoType !== "none") {
    const logo = hero.createDiv({ cls: "home-tab-logo" });
    if (settings.logoType === "lucide") {
      setIcon(logo, settings.logoValue.trim() || "lucide-home");
    } else {
      const source = resolveAssetSource(app, settings.logoType, settings.logoValue);
      if (source) {
        logo.createEl("img", { attr: { src: source, alt: "" } });
      } else {
        setIcon(logo, "lucide-image-off");
        logo.addClass("is-missing");
      }
    }
    logo.style.setProperty("--home-tab-logo-scale", String(settings.logoScale));
    if (settings.logoColor.trim().length > 0) {
      logo.style.color = settings.logoColor;
    }
  }

  if (settings.showWordmark && settings.wordmark.trim().length > 0) {
    const wordmark = hero.createDiv({ cls: "home-tab-wordmark", text: settings.wordmark });
    wordmark.style.fontSize = settings.fontSize;
    wordmark.style.fontWeight = String(settings.fontWeight);
  }
}
