import { cn } from "@/lib/utils";

/**
 * Isologo Codexy (la X). Usa `currentColor` para heredar color del contexto.
 * `variant="badge"` — cuadrado de color con la X adentro (default, ideal para topbars)
 * `variant="plain"` — solo la X sobre fondo transparente (ideal para hero, headers grandes)
 */
export function Logo({
  size = 30,
  className,
  variant = "badge",
  color,
}: {
  size?: number;
  className?: string;
  variant?: "badge" | "plain";
  color?: string;
}) {
  if (variant === "plain") {
    return (
      <span
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: size, height: size, color: color ?? "currentColor" }}
        aria-label="Codexy"
      >
        <CodexyXMark size={size} />
      </span>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: color ?? "var(--color-brand)",
        color: "#fff",
      }}
      aria-label="Codexy"
    >
      <CodexyXMark size={Math.round(size * 0.58)} />
    </div>
  );
}

/**
 * La X del logo Codexy: dos chevrones que se acercan al centro sin tocarse.
 * Dibujado en viewBox 100x100 para escalar limpio.
 */
function CodexyXMark({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      style={{ display: "block" }}
    >
      {/* Left chevron (>) */}
      <path d="M12 10 L28 10 Q32 10 35 14 L50 36 Q52 39 52 42 L52 58 Q52 61 50 64 L35 86 Q32 90 28 90 L12 90 Q8 90 10 86 L30 54 Q33 50 30 46 L10 14 Q8 10 12 10 Z" />
      {/* Right chevron (<) */}
      <path d="M88 10 L72 10 Q68 10 65 14 L50 36 Q48 39 48 42 L48 58 Q48 61 50 64 L65 86 Q68 90 72 90 L88 90 Q92 90 90 86 L70 54 Q67 50 70 46 L90 14 Q92 10 88 10 Z" />
    </svg>
  );
}
