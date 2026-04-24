import { cn } from "@/lib/utils";

/**
 * Isologo Codexy (la X). Renderiza el PNG oficial si existe, con fondo púrpura
 * de marca. Usar `variant="plain"` si solo querés la X sin fondo.
 */
export function Logo({
  size = 36,
  className,
  variant = "badge",
  color,
}: {
  size?: number;
  className?: string;
  variant?: "badge" | "plain";
  color?: string;
}) {
  // Plain: solo la X sin fondo (para usar sobre colores de marca ya aplicados)
  if (variant === "plain") {
    return (
      <span
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: size, height: size }}
        aria-label="Codexy"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/codexy-x-black.png"
          alt="Codexy"
          width={size}
          height={size}
          className="h-full w-full object-contain"
          style={{ filter: color === "white" ? "invert(1)" : undefined }}
          loading="eager"
          decoding="async"
        />
      </span>
    );
  }
  // Badge: X blanca sobre cuadrado púrpura de marca
  const innerSize = Math.round(size * 0.64);
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: color ?? "var(--color-brand)",
      }}
      aria-label="Codexy"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/codexy-x-black.png"
        alt=""
        width={innerSize}
        height={innerSize}
        className="object-contain"
        style={{ filter: "invert(1) brightness(2)" }}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}

/**
 * Logo horizontal completo "X CODEXY". Úsalo en splash / login / footer.
 */
export function LogoFull({
  height = 32,
  className,
  tone = "adaptive",
}: {
  height?: number;
  className?: string;
  /**
   * adaptive: se invierte en dark mode, queda negro en light mode
   * white: siempre blanco (para fondos de marca púrpura)
   * black: siempre negro (para fondos claros garantizados)
   */
  tone?: "adaptive" | "white" | "black";
}) {
  const filter =
    tone === "white"
      ? "invert(1) brightness(2)"
      : tone === "black"
        ? undefined
        : "var(--logo-adaptive-filter)";
  return (
    <span className={cn("inline-flex items-center", className)} aria-label="Codexy">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/codexy-full-black.png"
        alt="Codexy"
        height={height}
        className="w-auto object-contain"
        style={{ height, filter }}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
