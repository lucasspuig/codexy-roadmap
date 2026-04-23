import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  total,
  className,
  showLabel = false,
}: {
  value: number;
  total: number;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const done = total > 0 && value >= total;
  return (
    <div className={cn("w-full", className)}>
      <div
        className="h-1.5 w-full rounded-full bg-[var(--color-s3)] overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={cn(
            "h-full transition-[width] duration-300 ease-out",
            done ? "bg-[var(--color-brand)]" : "bg-[var(--color-info)]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel ? (
        <div className="flex items-center justify-between text-[11px] text-[var(--color-t3)] mt-1.5">
          <span>
            {value} / {total}
          </span>
          <span>{Math.round(pct)}%</span>
        </div>
      ) : null}
    </div>
  );
}
