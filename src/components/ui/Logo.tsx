import { cn } from "@/lib/utils";

export function Logo({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-[var(--color-brand)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
      }}
    >
      <svg
        viewBox="0 0 16 16"
        width={size * 0.5}
        height={size * 0.5}
        style={{ fill: "#0a0a0a" }}
      >
        <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
      </svg>
    </div>
  );
}
