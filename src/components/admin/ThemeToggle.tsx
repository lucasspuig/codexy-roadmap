"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "codexy-theme";

function getInitialTheme(): Theme {
  // Primera visita: respeta OS. Después: lo que guardó el user.
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  requestAnimationFrame(() => html.classList.add("theme-ready"));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  if (!mounted) {
    return (
      <div
        className="h-9 w-9 rounded-[8px] border border-[var(--color-b1)]"
        aria-hidden
      />
    );
  }

  const isDark = theme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-[8px]",
        "border border-[var(--color-b1)] bg-[var(--color-s1)]",
        "text-[var(--color-t2)] hover:text-[var(--color-t1)] hover:border-[var(--color-b2)]",
        "transition-all duration-200",
      )}
    >
      <Sun
        size={14}
        strokeWidth={2}
        className={cn(
          "absolute transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        size={14}
        strokeWidth={2}
        className={cn(
          "absolute transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
        )}
      />
    </button>
  );
}
