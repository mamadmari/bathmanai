import { useCallback, useEffect, useState } from "react";

export type WolfTheme = "dark" | "casino" | "light";

const STORAGE_KEY = "wolf.theme";
const ORDER: WolfTheme[] = ["dark", "casino", "light"];

/** Read the theme the user picked last time (casino felt is the default). */
export function storedWolfTheme(): WolfTheme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light" || v === "casino") return v;
  } catch {
    /* private mode — ignore */
  }
  return "casino";
}

/**
 * Apply the theme to <html>.
 * - `dark`   : gold + emerald “wolf den” (default)
 * - `casino` : money-green felt with neon jackpot accents
 * - `light`  : day mode
 * `dark` is kept on <html> for the shadcn/tailwind layer in both dark themes.
 */
export function applyWolfTheme(theme: WolfTheme): void {
  const root = document.documentElement;
  const light = theme === "light";
  root.classList.toggle("light", light);
  root.classList.toggle("dark", !light);
  root.classList.toggle("casino", theme === "casino");
  root.style.colorScheme = light ? "light" : "dark";
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Must run before the first paint so the shell never flashes the wrong theme. */
export function bootWolfTheme(): WolfTheme {
  const theme = storedWolfTheme();
  applyWolfTheme(theme);
  return theme;
}

export function useWolfTheme(): {
  theme: WolfTheme;
  toggle: () => void;
  set: (t: WolfTheme) => void;
} {
  const [theme, setTheme] = useState<WolfTheme>(storedWolfTheme);

  useEffect(() => {
    applyWolfTheme(theme);
  }, [theme]);

  // Cycles gold → casino → light → gold.
  const toggle = useCallback(() => {
    setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]);
  }, []);
  const set = useCallback((t: WolfTheme) => setTheme(t), []);

  return { theme, toggle, set };
}

export const WOLF_THEME_LABEL: Record<WolfTheme, { fa: string; en: string }> = {
  dark: { fa: "تم طلایی", en: "Gold den" },
  casino: { fa: "تم کازینویی", en: "Casino green" },
  light: { fa: "تم روشن", en: "Daylight" },
};
