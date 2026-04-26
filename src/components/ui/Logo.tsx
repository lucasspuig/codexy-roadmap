import { cn } from "@/lib/utils";

/**
 * Isologo Codexy (la X). Renderiza el PNG oficial.
 *
 * - variant="badge" → cuadrado púrpura con X blanca adentro (siempre)
 * - variant="plain" → solo la X, color adapta al theme (negra en light, blanca en dark)
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
  if (variant === "plain") {
    return (
      <span
        className={cn("inline-flex items-center justify-center relative", className)}
        style={{ width: size, height: size }}
        aria-label="Codexy"
      >
        {/* Versión negra para light mode */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/iso-logo-full-black.png"
          alt="Codexy"
          width={size}
          height={size}
          className="theme-asset-light h-full w-full object-contain"
          loading="eager"
          decoding="async"
        />
        {/* Versión blanca para dark mode */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/codexy-x-white.png"
          alt=""
          aria-hidden
          width={size}
          height={size}
          className="theme-asset-dark absolute inset-0 h-full w-full object-contain"
          loading="eager"
          decoding="async"
        />
      </span>
    );
  }

  // Badge: X blanca sobre cuadrado púrpura de marca (siempre blanca, no rota)
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
        src="/brand/codexy-x-white.png"
        alt=""
        aria-hidden
        width={innerSize}
        height={innerSize}
        className="object-contain"
        style={{ width: innerSize, height: innerSize }}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}

/**
 * Logo horizontal completo "X CODEXY". Úsalo en splash / login / footer.
 *
 * - tone="adaptive" (default) → negro en light, blanco en dark (auto via CSS)
 * - tone="white" → siempre blanco (para fondos de marca)
 * - tone="black" → siempre negro (para fondos claros garantizados)
 */
export function LogoFull({
  height = 32,
  className,
  tone = "adaptive",
}: {
  height?: number;
  className?: string;
  tone?: "adaptive" | "white" | "black";
}) {
  if (tone === "adaptive") {
    return (
      <span
        className={cn("relative inline-block", className)}
        style={{ height }}
        aria-label="Codexy"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/codexy-full-black.png"
          alt="Codexy"
          className="theme-asset-light w-auto object-contain"
          style={{ height }}
          loading="eager"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/codexy-white-logo.png"
          alt=""
          aria-hidden
          className="theme-asset-dark absolute inset-0 w-auto object-contain"
          style={{ height }}
          loading="eager"
          decoding="async"
        />
      </span>
    );
  }

  const src =
    tone === "white"
      ? "/brand/codexy-white-logo.png"
      : "/brand/codexy-full-black.png";
  return (
    <span className={cn("inline-flex items-center", className)} aria-label="Codexy">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Codexy"
        className="w-auto object-contain"
        style={{ height }}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
