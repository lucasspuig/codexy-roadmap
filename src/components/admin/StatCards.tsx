import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StatCardsProps {
  items: Array<{
    label: string;
    value: number | string;
    hint?: string;
    icon?: LucideIcon;
    accent?: "brand" | "info" | "warn" | "neutral";
    /** Si true, aplica gradient-text al número (destacado). Solo uno por grid recomendado. */
    hero?: boolean;
  }>;
}

const accentStyles: Record<NonNullable<StatCardsProps["items"][number]["accent"]>, string> = {
  brand:
    "text-[var(--color-brand)] bg-[var(--color-brand-muted)] border-[var(--color-brand-border)]",
  info: "text-[var(--color-info)] bg-[var(--color-info-muted)] border-[var(--color-info-border)]",
  warn: "text-[var(--color-warn)] bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] border-[color-mix(in_srgb,var(--color-warn)_30%,transparent)]",
  neutral: "text-[var(--color-t2)] bg-[var(--color-s3)] border-[var(--color-b1)]",
};

export function StatCards({ items }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-7">
      {items.map(({ label, value, hint, icon: Icon, accent = "neutral", hero }) => (
        <div
          key={label}
          className={cn(
            "card-elevated relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between min-h-[112px]",
          )}
        >
          {/* Top row: label + icon */}
          <div className="flex items-start justify-between gap-2">
            <span
              className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-t3)] truncate"
            >
              {label}
            </span>
            {Icon ? (
              <div
                className={cn(
                  "w-7 h-7 rounded-[7px] border flex items-center justify-center flex-shrink-0",
                  accentStyles[accent],
                )}
                aria-hidden
              >
                <Icon size={13} strokeWidth={2} />
              </div>
            ) : null}
          </div>

          {/* Hero number */}
          <div className="flex items-baseline gap-1.5 mt-2">
            <span
              className={cn(
                "tabular-nums leading-none",
                hero ? "grad-text-accent" : undefined,
              )}
              style={{
                fontFamily: "var(--ff-mono)",
                fontSize: "clamp(34px, 4.5vw, 48px)",
                fontWeight: 500,
                letterSpacing: "-0.035em",
                color: hero ? undefined : "var(--color-t1)",
              }}
            >
              {value}
            </span>
          </div>

          {/* Optional hint */}
          {hint ? (
            <div className="text-[10.5px] mt-2 text-[var(--color-t3)] tabular-nums leading-tight">
              {hint}
            </div>
          ) : null}

          {/* Sparkline decorativo (línea sutil al fondo de cada card) */}
          {hero ? (
            <svg
              className="absolute bottom-0 right-0 w-full h-10 opacity-30 pointer-events-none"
              viewBox="0 0 120 40"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 30 Q 20 18, 30 22 T 60 15 T 90 8 T 120 5 L 120 40 L 0 40 Z"
                fill={`url(#spark-${label})`}
              />
              <path
                d="M0 30 Q 20 18, 30 22 T 60 15 T 90 8 T 120 5"
                fill="none"
                stroke="var(--color-brand)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeOpacity="0.8"
              />
            </svg>
          ) : null}
        </div>
      ))}
    </div>
  );
}
