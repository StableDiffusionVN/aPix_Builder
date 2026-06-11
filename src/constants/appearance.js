export const PRO_THEME_OPTIONS = [
  { id: "dark", label: "Dark", swatch: "#0b0d12" },
  { id: "light", label: "Light", swatch: "#ffffff" }
];

export const COLORFUL_THEME_OPTIONS = [
  { id: "sdvn", label: "SDVN", swatch: "linear-gradient(to bottom, #5858e6, #151523)" },
  { id: "vietnam", label: "Việt Nam", swatch: "radial-gradient(ellipse at bottom, #c62921, #a21a14)" },
  { id: "skyline", label: "Skyline", swatch: "linear-gradient(to right, #6FB1FC, #4364F7, #0052D4)" },
  { id: "hidden-jaguar", label: "Hidden Jaguar", swatch: "linear-gradient(to top, #0fd850 0%, #f9f047 100%)" },
  { id: "wide-matrix", label: "Wide Matrix", swatch: "linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)" },
  { id: "rainbow", label: "RainBow", swatch: "linear-gradient(to right, #0575E6, #00F260)" },
  { id: "soundcloud", label: "SoundCloud", swatch: "linear-gradient(to right, #f83600, #fe8c00)" },
  { id: "amin", label: "Amin", swatch: "linear-gradient(to right, #4A00E0, #8E2DE2)" },
  { id: "emerald", label: "Emerald Lab", swatch: "radial-gradient(circle at 15% 20%, #34d399 0%, #10231d 58%, #030b08 100%)" },
  { id: "violet", label: "Violet Studio", swatch: "radial-gradient(circle at 15% 20%, #a78bfa 0%, #1b1730 58%, #05030b 100%)" }
];

export const THEME_OPTIONS = [...PRO_THEME_OPTIONS, ...COLORFUL_THEME_OPTIONS];

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
  if (stored === "minimal") return "dark";
  return THEME_OPTIONS.some(option => option.id === stored) ? stored : "dark";
}

export function loadMainFont() {
  const stored = localStorage.getItem(MAIN_FONT_STORAGE_KEY) || "";
  return MAIN_FONT_OPTIONS.some(option => option.id === stored) ? stored : "system";
}
