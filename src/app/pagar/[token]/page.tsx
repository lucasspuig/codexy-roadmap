import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadPagoPublico } from "@/app/pagar/actions";

import { PagarClient } from "./pagar-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pagar · Codexy",
  description: "Pagá tu cuota de mantenimiento mensual con Codexy.",
  robots: { index: false, follow: false, nocache: true },
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
};

export default async function PagarPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};
  if (!token || token.length < 16) notFound();
  const payload = await loadPagoPublico(token);
  if (!payload) notFound();

  return (
    <div
      className="public-view-wrap"
      style={{
        background: "var(--color-pub-bg, #0a0a0a)",
        color: "var(--color-pub-text, #fafafa)",
        minHeight: "100vh",
        fontFamily: "var(--ff-sans)",
      }}
    >
      <div
        className="max-w-2xl mx-auto px-4 sm:px-6 py-10"
        style={{ paddingBottom: 80 }}
      >
        <PagarClient
          token={token}
          payload={payload}
          initialError={sp.error ?? null}
        />
      </div>
    </div>
  );
}
