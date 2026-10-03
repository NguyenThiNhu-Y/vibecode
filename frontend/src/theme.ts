import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "scopeai-theme";

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Light by default; the choice is remembered per browser. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // storage unavailable: theme still applies for this session
    }
    window.dispatchEvent(new CustomEvent("scopeai-theme", { detail: theme }));
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

/** Current theme for components that render outside CSS (e.g. Mermaid). */
export function useCurrentTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("scopeai-theme", onChange);
    return () => window.removeEventListener("scopeai-theme", onChange);
  }, []);
  return theme;
}
