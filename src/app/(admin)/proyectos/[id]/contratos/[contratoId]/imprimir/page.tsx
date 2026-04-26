import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContratoDocument } from "@/components/contratos/ContratoDocument";
import { createClient } from "@/lib/supabase/server";
import type { AgencySettings, Contrato } from "@/types/contratos";
import type { Cliente } from "@/types/database";

import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string; contratoId: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { contratoId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contratos")
    .select("numero")
    .eq("id", contratoId)
    .maybeSingle<{ numero: string }>();
  return {
    title: data?.numero ? `Contrato ${data.numero}` : "Contrato",
    robots: { index: false, follow: false },
  };
}

export default async function ImprimirContratoPage({ params }: PageProps) {
  const { contratoId } = await params;
  const supabase = await createClient();

  const { data: contratoRow } = await supabase
    .from("contratos")
    .select("*")
    .eq("id", contratoId)
    .maybeSingle();
  const contrato = contratoRow as unknown as Contrato | null;
  if (!contrato) notFound();

  const [{ data: clienteRow }, { data: agencyRow }] = await Promise.all([
    supabase
      .from("clientes")
      .select("nombre, empresa, email, telefono")
      .eq("id", contrato.cliente_id)
      .maybeSingle(),
    supabase
      .from("agency_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const cliente = clienteRow as Pick<
    Cliente,
    "nombre" | "empresa" | "email" | "telefono"
  > | null;
  if (!cliente) notFound();

  const agency = agencyRow as unknown as AgencySettings | null;

  return (
    <div className="contrato-print-wrap" style={{ background: "#f6f5f1", minHeight: "100vh", padding: "18px 0" }}>
      <ContratoDocument
        contrato={contrato}
        cliente={cliente}
        agency={agency}
      />
      <PrintButton />
    </div>
  );
}
