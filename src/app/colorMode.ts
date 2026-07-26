export type ColorMode = "light" | "dark";

export const COLOR_MODE_STORAGE_KEY = "mitsubachi.colorMode";

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode;
  document.documentElement.style.colorScheme = mode;
}

export function getInitialColorMode(): ColorMode {
  const storedMode = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  if (storedMode === "light" || storedMode === "dark") return storedMode;
  if (!window.matchMedia) return "light";

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function persistColorMode(mode: ColorMode) {
  localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
}
