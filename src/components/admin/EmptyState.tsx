import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-center py-16 px-5 border border-dashed border-[var(--color-b1)] rounded-[14px] bg-[var(--color-s1)]/40",
        className,
      )}
    >
      {Icon ? (
        <div className="mx-auto w-12 h-12 rounded-full bg-[var(--color-s2)] border border-[var(--color-b1)] flex items-center justify-center mb-4">
          <Icon size={22} className="text-[var(--color-t3)]" />
        </div>
      ) : null}
      <h2 className="text-[17px] font-medium text-[var(--color-t1)] mb-1.5">{title}</h2>
      {description ? (
        <p className="text-[13px] text-[var(--color-t3)] max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
