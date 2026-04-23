import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadPublicRoadmap } from "@/app/api/public/[token]/route";

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
  // Evitamos bumpear el contador desde metadata — lo hacemos solo en el render de la página.
  const data = await loadPublicRoadmap(token, { touch: false }).catch(() => null);
  const nombre = data?.cliente?.nombre ?? "cliente";
  return {
    title: `Plan de implementación · ${nombre}`,
    description:
      data?.proyecto?.subtitulo ??
      "Seguimiento en vivo del plan de implementación de tu proyecto con Codexy.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
    openGraph: {
      title: `Plan de implementación · ${nombre}`,
      description: "Seguimiento en vivo del plan con Codexy",
      type: "website",
    },
  };
}

export default async function PublicRoadmapPage({ params }: PageProps) {
  const { token } = await params;

  // Guard rápido: formato inválido → 404 sin tocar la DB.
  if (!TOKEN_RE.test(token)) notFound();

  const data = await loadPublicRoadmap(token);
  if (!data) notFound();

  return (
    <div
      className="public-view-wrap print-page"
      style={{
        background: "var(--color-pub-bg)",
        color: "var(--color-pub-text)",
        minHeight: "100vh",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Timeline token={token} initial={data} />
    </div>
  );
}
