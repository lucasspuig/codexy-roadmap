import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StatCardsProps {
  items: Array<{
    label: string;
    value: number | string;
    icon?: LucideIcon;
    accent?: "brand" | "info" | "warn" | "neutral";
  }>;
}

const accentStyles: Record<NonNullable<StatCardsProps["items"][number]["accent"]>, string> = {
  brand: "text-[var(--color-brand)] bg-[var(--color-brand-muted)] border-[var(--color-brand-border)]",
  info: "text-[var(--color-info)] bg-[var(--color-info-muted)] border-[var(--color-info-border)]",
  warn: "text-[var(--color-warn)] bg-[rgba(251,191,36,0.08)] border-[rgba(251,191,36,0.25)]",
  neutral: "text-[var(--color-t2)] bg-[var(--color-s3)] border-[var(--color-b1)]",
};

export function StatCards({ items }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map(({ label, value, icon: Icon, accent = "neutral" }) => (
        <div
          key={label}
          className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4 flex items-start justify-between gap-3"
        >
          <div>
            <div className="text-[11px] font-medium text-[var(--color-t3)] uppercase tracking-wider">
              {label}
            </div>
            <div className="text-[22px] font-semibold text-[var(--color-t1)] mt-1.5 leading-none">
              {value}
            </div>
          </div>
          {Icon ? (
            <div
              className={cn(
                "w-8 h-8 rounded-[8px] border flex items-center justify-center flex-shrink-0",
                accentStyles[accent],
              )}
            >
              <Icon size={15} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
