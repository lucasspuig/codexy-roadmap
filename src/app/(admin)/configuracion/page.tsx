import { ConfiguracionClient } from "./ConfiguracionClient";
import { getAgencySettings } from "@/app/(admin)/contratos/actions";
import { createClient } from "@/lib/supabase/server";
import type { MensajeTemplate } from "@/types/cobros";

export const metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const [agencyRes, tplRes, escalacionRes] = await Promise.all([
    getAgencySettings(),
    supabase
      .from("mensaje_templates")
      .select("id, nombre, descripcion, cuerpo, activo, updated_at")
      .order("id", { ascending: true }),
    supabase
      .from("agency_payment_data")
      .select("numero_escalacion")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const initial = agencyRes.ok ? agencyRes.data : null;
  const templates = (tplRes.data as MensajeTemplate[] | null) ?? [];
  const numeroEscalacion =
    (escalacionRes.data as { numero_escalacion: string | null } | null)
      ?.numero_escalacion ?? null;

  // Detectar si Evolution API está configurada — solo lo leemos en el server
  const evolutionConfigurada = Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE,
  );

  return (
    <ConfiguracionClient
      initial={initial}
      templates={templates}
      numeroEscalacion={numeroEscalacion}
      evolutionConfigurada={evolutionConfigurada}
    />
  );
}
