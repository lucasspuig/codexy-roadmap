"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "codexy-theme";

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  let effective: "light" | "dark";
  if (theme === "system") {
    effective = window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } else {
    effective = theme;
  }
  html.setAttribute("data-theme", effective);
  // Marca que ya renderizamos para permitir las transiciones suaves
  requestAnimationFrame(() => html.classList.add("theme-ready"));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setTheme(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);

    // Si está en "system", escuchá cambios del OS
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => applyTheme("system");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, [theme, mounted]);

  // Evita flash de theme incorrecto antes del mount
  if (!mounted) {
    return (
      <div
        className="h-9 w-[108px] rounded-[7px] border border-[var(--color-b1)]"
        aria-hidden
      />
    );
  }

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "system", label: "Sistema", icon: Monitor },
    { value: "dark", label: "Oscuro", icon: Moon },
  ];

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-[8px] border border-[var(--color-b1)] bg-[var(--color-s2)] p-0.5"
      role="radiogroup"
      aria-label="Tema de la interfaz"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            title={label}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-[6px] transition-all",
              active
                ? "bg-[var(--color-brand-muted)] text-[var(--color-brand)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-t3)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s3)]",
            )}
          >
            <Icon size={13} strokeWidth={active ? 2.5 : 2} />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
