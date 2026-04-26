import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EstadoCuentaDocument } from "@/components/estado-cuenta/EstadoCuentaDocument";
import { createClient } from "@/lib/supabase/server";
import type { Contrato } from "@/types/contratos";
import type { Cliente } from "@/types/database";
import type { Pago } from "@/types/pagos";

import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ revision?: string; subtitulo?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { clienteId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", clienteId)
    .maybeSingle<{ nombre: string }>();
  return {
    title: data?.nombre
      ? `Estado de cuenta · ${data.nombre}`
      : "Estado de cuenta",
    robots: { index: false, follow: false },
  };
}

export default async function ImprimirEstadoCuentaPage({
  params,
  searchParams,
}: PageProps) {
  const { clienteId } = await params;
  const { revision, subtitulo } = await searchParams;
  const supabase = await createClient();

  // Auth: si no hay sesión, mandar al login.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/imprimir/cuenta/${clienteId}`);
  }

  const { data: clienteRow } = await supabase
    .from("clientes")
    .select("id, nombre, empresa, rubro")
    .eq("id", clienteId)
    .maybeSingle();
  const cliente = clienteRow as Pick<
    Cliente,
    "id" | "nombre" | "empresa" | "rubro"
  > | null;
  if (!cliente) notFound();

  const [{ data: contratosRows }, { data: pagosRows }] = await Promise.all([
    supabase
      .from("contratos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pagos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("fecha_pago", { ascending: false }),
  ]);

  const contratos = (contratosRows as unknown as Contrato[]) ?? [];
  const pagos = (pagosRows as unknown as Pago[]) ?? [];

  return (
    <div
      className="estado-cuenta-print-wrap"
      style={{
        background: "#f6f5f1",
        minHeight: "100vh",
        padding: "18px 0",
      }}
    >
      <EstadoCuentaDocument
        cliente={cliente}
        contratos={contratos}
        pagos={pagos}
        revision={revision || undefined}
        subtitulo={subtitulo || undefined}
      />
      <PrintButton />
    </div>
  );
}
