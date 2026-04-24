import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  total,
  className,
  showLabel = false,
  thick = false,
}: {
  value: number;
  total: number;
  className?: string;
  showLabel?: boolean;
  /** Altura 6px (default) o 4px cuando es para stats pequeños */
  thick?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const done = total > 0 && value >= total;
  const height = thick ? "h-1.5" : "h-1";
  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "w-full rounded-full overflow-hidden relative",
          height,
        )}
        style={{
          background: "color-mix(in srgb, var(--color-b1) 60%, transparent)",
        }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={cn(
            "h-full rounded-full relative overflow-hidden",
            "transition-[width] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
          style={{
            width: `${pct}%`,
            background: done
              ? "linear-gradient(90deg, var(--color-brand), color-mix(in srgb, var(--color-brand) 70%, #fff))"
              : "linear-gradient(90deg, color-mix(in srgb, var(--color-brand) 80%, transparent), var(--color-brand))",
            boxShadow:
              pct > 0
                ? "0 0 8px color-mix(in srgb, var(--color-brand) 50%, transparent), 0 0 1px var(--color-brand)"
                : undefined,
          }}
        >
          {/* Shimmer sutil mientras está en progreso (no al 0%, no al 100%) */}
          {pct > 0 && pct < 100 ? (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2.4s linear infinite",
              }}
            />
          ) : null}
        </div>
      </div>
      {showLabel ? (
        <div className="flex items-center justify-between mt-1.5">
          <span
            className="text-[10.5px] tabular-nums font-medium"
            style={{
              fontFamily: "var(--ff-mono)",
              color: "var(--color-t3)",
            }}
          >
            {value}/{total}
          </span>
          <span
            className="text-[10.5px] tabular-nums font-semibold"
            style={{
              fontFamily: "var(--ff-mono)",
              color: done ? "var(--color-brand)" : "var(--color-t2)",
            }}
          >
            {Math.round(pct)}%
          </span>
        </div>
      ) : null}
    </div>
  );
}
