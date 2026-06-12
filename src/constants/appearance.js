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

export const THEME_STORAGE_KEY = "comfyui-build:theme";
export const MAIN_FONT_STORAGE_KEY = "comfyui-build:main-font";

export function loadTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) || "";
  return THEME_OPTIONS.some(option => option.id === stored) ? stored : "dark";
}

export function loadMainFont() {
  const stored = localStorage.getItem(MAIN_FONT_STORAGE_KEY) || "";
  return MAIN_FONT_OPTIONS.some(option => option.id === stored) ? stored : "system";
}
