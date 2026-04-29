import { CobrosClient, type CobrosCuotaData } from "@/components/admin/CobrosClient";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cobros" };
export const dynamic = "force-dynamic";

export default async function CobrosPage() {
  const supabase = await createClient();

  // Ventana: desde hoy − 30 días hasta hoy + 60 días.
  // Así también vemos las atrasadas, que son las que más nos interesan.
  const today = new Date();
  const desde = new Date(today);
  desde.setDate(desde.getDate() - 30);
  const hasta = new Date(today);
  hasta.setDate(hasta.getDate() + 60);

  const desdeISO = desde.toISOString().slice(0, 10);
  const hastaISO = hasta.toISOString().slice(0, 10);

  const { data: cuotaRows, error } = await supabase
    .from("cuotas_mensuales")
    .select(
      `
      id, contrato_id, cliente_id, periodo, fecha_recordatorio_1,
      fecha_recordatorio_2, fecha_vencimiento, fecha_escalacion, monto_usd,
      estado, es_trimestral, meses_cubiertos, pago_id, pagada_at,
      recordatorio_1_enviado_at, recordatorio_2_enviado_at,
      clientes:clientes(id, nombre, empresa, telefono),
      contratos:contratos(numero, servicio_titulo, moneda)
      `,
    )
    .gte("fecha_vencimiento", desdeISO)
    .lte("fecha_vencimiento", hastaISO)
    .order("fecha_vencimiento", { ascending: true });

  type Row = {
    id: string;
    contrato_id: string;
    cliente_id: string;
    periodo: string;
    fecha_recordatorio_1: string;
    fecha_recordatorio_2: string;
    fecha_vencimiento: string;
    fecha_escalacion: string;
    monto_usd: number;
    estado: CobrosCuotaData["estado"];
    es_trimestral: boolean;
    meses_cubiertos: number;
    pago_id: string | null;
    pagada_at: string | null;
    recordatorio_1_enviado_at: string | null;
    recordatorio_2_enviado_at: string | null;
    clientes: { id: string; nombre: string; empresa: string | null; telefono: string | null } | null;
    contratos: { numero: string; servicio_titulo: string; moneda: string } | null;
  };

  const rows = (cuotaRows as Row[] | null) ?? [];
  const cuotas: CobrosCuotaData[] = rows.map((r) => ({
    id: r.id,
    contrato_id: r.contrato_id,
    cliente_id: r.cliente_id,
    periodo: r.periodo,
    fecha_recordatorio_1: r.fecha_recordatorio_1,
    fecha_recordatorio_2: r.fecha_recordatorio_2,
    fecha_vencimiento: r.fecha_vencimiento,
    fecha_escalacion: r.fecha_escalacion,
    monto_usd: Number(r.monto_usd ?? 0),
    estado: r.estado,
    es_trimestral: r.es_trimestral,
    meses_cubiertos: r.meses_cubiertos,
    pago_id: r.pago_id,
    pagada_at: r.pagada_at,
    recordatorio_1_enviado_at: r.recordatorio_1_enviado_at,
    recordatorio_2_enviado_at: r.recordatorio_2_enviado_at,
    cliente: {
      id: r.clientes?.id ?? r.cliente_id,
      nombre: r.clientes?.nombre ?? "(sin cliente)",
      empresa: r.clientes?.empresa ?? null,
      telefono: r.clientes?.telefono ?? null,
    },
    contrato: {
      numero: r.contratos?.numero ?? "—",
      servicio_titulo: r.contratos?.servicio_titulo ?? "—",
      moneda: r.contratos?.moneda ?? "USD",
    },
  }));

  // Detectar si Evolution API está configurada — solo lo leemos en el server
  const evolutionConfigurada = Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE,
  );

  if (error) {
    // No bloqueamos render: pasamos array vacío y mostramos el error como banner.
    return (
      <CobrosClient
        cuotas={[]}
        loadError={error.message}
        evolutionConfigurada={evolutionConfigurada}
      />
    );
  }

  return (
    <CobrosClient
      cuotas={cuotas}
      loadError={null}
      evolutionConfigurada={evolutionConfigurada}
    />
  );
}
