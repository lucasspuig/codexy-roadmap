import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadPublicRoadmap } from "@/app/api/public/[token]/route";
import { loadPublicSaldos } from "@/app/api/public/[token]/saldos/route";

import { EstadoCuentaCard } from "./EstadoCuentaCard";
import { Timeline } from "./Timeline";

// Siempre dinámico — cada request chequea el token.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TOKEN_RE = /^[a-f0-9]{64}$/;

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return {
      title: "Link no disponible",
      robots: { index: false, follow: false },
    };
  }
  const data = await loadPublicRoadmap(token).catch(() => null);
  const nombre = data?.cliente?.nombre ?? "cliente";
  const subtitulo =
    data?.proyecto?.subtitulo ??
    "Seguimiento en vivo del plan de implementación de tu proyecto con Codexy.";
  const ogImage = data?.branding?.logo_url ?? "/brand/codexy-full-black.png";
  return {
    title: `Plan de implementación · ${nombre}`,
    description: subtitulo,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
    openGraph: {
      title: `Plan de implementación · ${nombre}`,
      description: subtitulo,
      siteName: "Codexy",
      type: "website",
      images: [{ url: ogImage, alt: `Plan de implementación · ${nombre}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Plan de implementación · ${nombre}`,
      description: "Seguimiento en vivo con Codexy",
      images: [ogImage],
    },
    icons: {
      icon: "/icon.svg",
      apple: "/apple-icon.svg",
    },
  };
}

export default async function PublicRoadmapPage({ params }: PageProps) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) notFound();

  const [data, saldos] = await Promise.all([
    loadPublicRoadmap(token),
    loadPublicSaldos(token).catch(() => null),
  ]);
  if (!data) notFound();

  // Branding del cliente: si existen colores personalizados, overrideamos CSS vars.
  // Caemos a defaults (paleta warm Codexy) cuando no hay branding.
  const brand = data.branding?.colors ?? null;
  const brandStyle: React.CSSProperties = {
    background: "var(--color-pub-bg)",
    color: "var(--color-pub-text)",
    minHeight: "100vh",
    fontFamily: "var(--font-sans)",
  };
  const brandVars = brand
    ? ({
        ...(brand.bg ? { "--color-pub-bg": brand.bg } : {}),
        ...(brand.text ? { "--color-pub-text": brand.text } : {}),
        ...(brand.primary
          ? {
              "--color-pub-info": brand.primary,
              "--color-pub-info-l": hexToTint(brand.primary, 0.08),
            }
          : {}),
        ...(brand.accent
          ? {
              "--color-pub-accent": brand.accent,
              "--color-pub-accent-m": brand.accent,
              "--color-pub-accent-l": hexToTint(brand.accent, 0.1),
            }
          : {}),
      } as React.CSSProperties)
    : {};

  return (
    <div
      className="public-view-wrap print-page tech-bg"
      style={{ ...brandStyle, ...brandVars }}
    >
      <Timeline
        token={token}
        initial={data}
        saldosBlock={
          saldos ? <EstadoCuentaCard saldos={saldos} /> : null
        }
      />
    </div>
  );
}

/** Convierte un hex a rgba con la opacidad dada. Util para generar tonos suaves. */
function hexToTint(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
