import { cn } from "@/lib/utils";
import type { FaseEstado } from "@/types/database";

const labels: Record<FaseEstado, string> = {
  done: "Completado",
  active: "En curso",
  pending: "Pendiente",
};

export function StatusBadge({ estado, className }: { estado: FaseEstado; className?: string }) {
  const styles: Record<FaseEstado, string> = {
    done: "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]",
    active:
      "bg-[var(--color-info-muted)] border-[var(--color-info-border)] text-[var(--color-info)]",
    pending: "bg-[var(--color-s3)] border-[var(--color-b2)] text-[var(--color-t2)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-[3px] rounded-full border",
        styles[estado],
        className,
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          estado === "done" && "bg-[var(--color-brand)]",
          estado === "active" && "bg-[var(--color-info)]",
          estado === "pending" && "bg-[var(--color-t3)]",
        )}
      />
      {labels[estado]}
    </span>
  );
}
