import { getSetting } from "../lib/appSettings.js";

export const THEME_OPTIONS = [
  { id: "dark", label: "Dark", swatch: "#0b0d12" },
  { id: "light", label: "Light", swatch: "#ffffff" }
];

export const MAIN_FONT_OPTIONS = [
  { id: "inter", label: "Inter", family: "\"Inter\"", stylesheet: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
  { id: "noto", label: "Noto Sans", family: "\"Noto Sans\"", stylesheet: "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&display=swap" },
  { id: "manrope", label: "Manrope", family: "\"Manrope\"", stylesheet: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" },
  { id: "jakarta", label: "Plus Jakarta Sans", family: "\"Plus Jakarta Sans\"", stylesheet: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" },
  { id: "system", label: "System UI", family: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\"" }
];

const MAIN_FONT_STYLESHEET_ID = "apix-main-font-stylesheet";

export function syncMainFontStylesheet(font, documentRef = document) {
  let link = documentRef.getElementById(MAIN_FONT_STYLESHEET_ID);
  if (!font?.stylesheet) {
    link?.remove();
    return;
  }
  if (!link) {
    link = documentRef.createElement("link");
    link.id = MAIN_FONT_STYLESHEET_ID;
    link.rel = "stylesheet";
    documentRef.head.appendChild(link);
  }
  if (link.href !== font.stylesheet) link.href = font.stylesheet;
}

export function loadTheme() {
  const stored = getSetting("appearance.theme", "");
  return THEME_OPTIONS.some(option => option.id === stored) ? stored : "dark";
}

export function loadMainFont() {
  const stored = getSetting("appearance.mainFont", "");
  return MAIN_FONT_OPTIONS.some(option => option.id === stored) ? stored : "system";
}
