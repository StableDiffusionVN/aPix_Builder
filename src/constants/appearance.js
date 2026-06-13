import { getSetting } from "../lib/appSettings.js";

export const THEME_OPTIONS = [
  { id: "dark", label: "Dark", swatch: "#0b0d12" },
  { id: "light", label: "Light", swatch: "#ffffff" }
];

export const MAIN_FONT_OPTIONS = [
  { id: "inter", label: "Inter", family: "\"Inter\"" },
  { id: "noto", label: "Noto Sans", family: "\"Noto Sans\"" },
  { id: "manrope", label: "Manrope", family: "\"Manrope\"" },
  { id: "jakarta", label: "Plus Jakarta Sans", family: "\"Plus Jakarta Sans\"" },
  { id: "system", label: "System UI", family: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\"" }
];

export function loadTheme() {
  const stored = getSetting("appearance.theme", "");
  return THEME_OPTIONS.some(option => option.id === stored) ? stored : "dark";
}

export function loadMainFont() {
  const stored = getSetting("appearance.mainFont", "");
  return MAIN_FONT_OPTIONS.some(option => option.id === stored) ? stored : "system";
}
