import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContratoDocument } from "@/components/contratos/ContratoDocument";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgencySettings, Contrato } from "@/types/contratos";
import type { Cliente } from "@/types/database";

import { ContratoSignClient } from "./sign-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TOKEN_RE = /^[a-f0-9]{64}$/;

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return {
      title: "Contrato no disponible",
      robots: { index: false, follow: false },
    };
  }
  const data = await loadContratoByToken(token).catch(() => null);
  return {
    title: data ? `Contrato ${data.contrato.numero}` : "Contrato",
    description: "Revisá y firmá tu contrato con Codexy.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

interface LoadResult {
  contrato: Contrato;
  cliente: Pick<Cliente, "nombre" | "empresa" | "email" | "telefono">;
  agency: AgencySettings | null;
}

async function loadContratoByToken(token: string): Promise<LoadResult | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const { data: contratoRow } = await admin
    .from("contratos")
    .select("*")
    .eq("token_publico", token)
    .maybeSingle();
  const contrato = contratoRow as unknown as Contrato | null;
  if (!contrato) return null;

  // Sólo permitimos ver públicamente si está enviado o ya firmado
  if (
    contrato.estado !== "enviado" &&
    contrato.estado !== "firmado_completo" &&
    contrato.estado !== "firmado_cliente"
  ) {
    return null;
  }

  const [{ data: clienteRow }, { data: agencyRow }] = await Promise.all([
    admin
      .from("clientes")
      .select("nombre, empresa, email, telefono")
      .eq("id", contrato.cliente_id)
      .maybeSingle(),
    admin.from("agency_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const cliente = clienteRow as Pick<
    Cliente,
    "nombre" | "empresa" | "email" | "telefono"
  > | null;
  if (!cliente) return null;
  const agency = agencyRow as unknown as AgencySettings | null;

  return { contrato, cliente, agency };
}

export default async function PublicSignPage({ params }: PageProps) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  const data = await loadContratoByToken(token);
  if (!data) notFound();

  const { contrato, cliente, agency } = data;
  const isSigned = contrato.estado === "firmado_completo";

  return (
    <div
      className="public-view-wrap tech-bg"
      style={{
        background: "var(--color-pub-bg)",
        color: "var(--color-pub-text)",
        minHeight: "100vh",
        fontFamily: "var(--ff-sans)",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-40">
        {/* Header / cliente intro */}
        <header className="mb-6 flex items-center gap-3">
          <div
            aria-label="Codexy"
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "var(--color-pub-info)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              viewBox="0 0 100 100"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 10 L28 10 Q32 10 35 14 L50 36 Q52 39 52 42 L52 58 Q52 61 50 64 L35 86 Q32 90 28 90 L12 90 Q8 90 10 86 L30 54 Q33 50 30 46 L10 14 Q8 10 12 10 Z" />
              <path d="M88 10 L72 10 Q68 10 65 14 L50 36 Q48 39 48 42 L48 58 Q48 61 50 64 L65 86 Q68 90 72 90 L88 90 Q92 90 90 86 L70 54 Q67 50 70 46 L90 14 Q92 10 88 10 Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "var(--color-pub-text3)",
              }}
            >
              CODEXY
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--color-pub-text2)",
                fontFamily: "var(--ff-mono)",
              }}
            >
              {contrato.numero}
            </div>
          </div>
          {isSigned ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.35)",
                color: "#86efac",
              }}
            >
              Firmado
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                padding: "4px 10px",
                borderRadius: 999,
                background: "var(--color-pub-info-l)",
                border: "1px solid rgba(139,92,246,0.35)",
                color: "var(--color-pub-accent)",
              }}
            >
              Esperando firma
            </span>
          )}
        </header>

        {/* Intro */}
        <div className="glass-card rounded-[14px] p-5 mb-6">
          <h1
            className="grad-text"
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.025em",
              margin: 0,
              marginBottom: 6,
            }}
          >
            {isSigned
              ? "Contrato firmado"
              : `Hola ${cliente.nombre.split(" ")[0]}, te enviamos el contrato.`}
          </h1>
          <p
            style={{
              color: "var(--color-pub-text2)",
              fontSize: 14,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {isSigned
              ? `Este contrato fue firmado el ${formatFechaSafe(
                  contrato.fecha_firmado_completo,
                )}. Podés descargar una copia en PDF.`
              : "Revisalo con calma. Si todo está OK, firmá al pie con tu mouse o el dedo (en celular). Cualquier duda, escribinos."}
          </p>
        </div>

        {/* El documento */}
        <div className="contrato-doc-screen-wrap">
          <ContratoDocument
            contrato={contrato}
            cliente={cliente}
            agency={agency}
          />
        </div>

        <ContratoSignClient
          token={token}
          isSigned={isSigned}
          contractoNumero={contrato.numero}
          fechaFirma={contrato.fecha_firmado_completo}
        />
      </div>
    </div>
  );
}

function formatFechaSafe(input: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
