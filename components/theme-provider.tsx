"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  function applyTheme(next: Theme) {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("hf-theme");
    const nextTheme =
      stored === "light" || stored === "dark" ? stored : defaultTheme;
    applyTheme(nextTheme);
    queueMicrotask(() => {
      setTheme(nextTheme);
      setMounted(true);
    });
  }, [defaultTheme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    window.localStorage.setItem("hf-theme", next);
  };

  return (
    <ThemeContext.Provider
      value={{ theme: mounted ? theme : defaultTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
