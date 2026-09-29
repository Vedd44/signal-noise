"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "signal-noise-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute("content", theme === "dark" ? "#25241f" : "#f3f0e8");
}

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const initialTheme: Theme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : mediaQuery.matches
          ? "dark"
          : "light";

    if (storedTheme !== null && storedTheme !== "light" && storedTheme !== "dark") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    const syncUnstoredPreference = () => {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        const nextTheme: Theme = mediaQuery.matches ? "dark" : "light";
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }
    };

    setTheme(initialTheme);
    applyTheme(initialTheme);
    mediaQuery.addEventListener("change", syncUnstoredPreference);

    return () => mediaQuery.removeEventListener("change", syncUnstoredPreference);
  }, []);

  const nextTheme = theme === "light" ? "dark" : "light";

  const toggleTheme = () => {
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className="theme-trigger"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
      <span>{nextTheme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
