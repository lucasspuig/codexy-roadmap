"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { fetchCotizacionDolar } from "@/lib/cambio";
import { sendWhatsapp, normalizePhone } from "@/lib/evolution-api";
import { renderTemplate } from "@/lib/templates";
import {
  formatARS,
  formatFechaCorta,
  formatFechaDDMM,
  formatUSD,
} from "@/lib/cuotas";
import type { Profile } from "@/types/database";
import type { CuotaEstado } from "@/types/cobros";
import type { PagoMetodo } from "@/types/pagos";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function assertAdmin(): Promise<
  | { ok: true; userId: string; profile: Pick<Profile, "id" | "nombre" | "email" | "role" | "activo"> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, activo")
    .eq("id", user.id)
    .single();
  const profile = data as Pick<
    Profile,
    "id" | "nombre" | "email" | "role" | "activo"
  > | null;
  if (!profile?.activo) return { ok: false, error: "Cuenta inactiva" };
  return { ok: true, userId: user.id, profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Forzar recordatorio: manda WA ya, sin esperar al cron
// ─────────────────────────────────────────────────────────────────────────────

type RecordatorioTipo = "recordatorio_1" | "recordatorio_2";

export async function forzarRecordatorio(input: {
  cuota_id: string;
  tipo: RecordatorioTipo;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  if (input.tipo !== "recordatorio_1" && input.tipo !== "recordatorio_2") {
    return { ok: false, error: "Tipo de recordatorio inválido" };
  }

  const supabase = await createClient();

  const { data: cuotaRow, error: cuotaErr } = await supabase
    .from("cuotas_mensuales")
    .select("*, clientes:clientes(id, nombre, telefono, empresa)")
    .eq("id", input.cuota_id)
    .maybeSingle();
  if (cuotaErr) return { ok: false, error: cuotaErr.message };
  const cuota = cuotaRow as
    | (Record<string, unknown> & {
        id: string;
        clientes: {
          id: string;
          nombre: string;
          telefono: string | null;
          empresa: string | null;
        } | null;
      })
    | null;
  if (!cuota) return { ok: false, error: "Cuota no encontrada" };
  const cliente = cuota.clientes;
  if (!cliente?.telefono) {
    return { ok: false, error: "El cliente no tiene teléfono cargado" };
  }

  const [{ data: tplRow }, { data: agencyRow }, cotizacion] = await Promise.all(
    [
      supabase
        .from("mensaje_templates")
        .select("cuerpo")
        .eq("id", input.tipo)
        .eq("activo", true)
        .maybeSingle(),
      supabase
        .from("agency_payment_data")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),
      fetchCotizacionDolar(),
    ],
  );

  const tpl = (tplRow as { cuerpo: string } | null)?.cuerpo;
  if (!tpl) {
    return {
      ok: false,
      error: `Template ${input.tipo} no encontrado o inactivo`,
    };
  }

  const agency = (agencyRow as Record<string, unknown> | null) ?? null;
  const ctx = buildTemplateContext(cuota, cliente, agency, cotizacion?.promedio ?? null);
  const cuerpo = renderTemplate(tpl, ctx);

  const result = await sendWhatsapp({
    telefono: cliente.telefono,
    mensaje: cuerpo,
  });

  await supabase.from("mensajes_enviados").insert({
    cliente_id: cliente.id,
    cuota_id: cuota.id,
    template_id: input.tipo,
    telefono_destino: normalizePhone(cliente.telefono) ?? cliente.telefono,
    cuerpo,
    estado: result.ok ? "enviado" : "fallido",
    error: result.error ?? null,
    evolution_response: (result.payload as object) ?? null,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Envío fallido" };
  }

  // Marcar como recordada y guardar timestamp
  const ahora = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (input.tipo === "recordatorio_1") {
    patch.estado = "recordada_1";
    patch.recordatorio_1_enviado_at = ahora;
  } else {
    patch.estado = "recordada_2";
    patch.recordatorio_2_enviado_at = ahora;
  }
  await supabase.from("cuotas_mensuales").update(patch).eq("id", cuota.id);

  revalidatePath("/cobros");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Marcar cuota como pagada (registra pago manualmente)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_METODOS: ReadonlySet<PagoMetodo> = new Set([
  "transferencia",
  "efectivo",
  "mercadopago",
  "tarjeta",
  "cripto",
  "otro",
]);

export interface MarcarCuotaPagadaInput {
  cuota_id: string;
  monto_real: number;
  moneda: string;
  tipo_cambio_aplicado?: number | null;
  metodo: PagoMetodo;
  fecha_pago: string;
  comprobante_url?: string | null;
  notas?: string | null;
}

export async function marcarCuotaPagada(
  input: MarcarCuotaPagadaInput,
): Promise<ActionResult<{ pago_id: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  if (!Number.isFinite(input.monto_real) || input.monto_real <= 0) {
    return { ok: false, error: "Monto inválido" };
  }
  if (!ALLOWED_METODOS.has(input.metodo)) {
    return { ok: false, error: "Método inválido" };
  }
  if (!input.fecha_pago) {
    return { ok: false, error: "Falta la fecha de pago" };
  }

  const supabase = await createClient();

  const { data: cuotaRow } = await supabase
    .from("cuotas_mensuales")
    .select("id, contrato_id, cliente_id, periodo, estado")
    .eq("id", input.cuota_id)
    .maybeSingle();
  const cuota = cuotaRow as
    | {
        id: string;
        contrato_id: string;
        cliente_id: string;
        periodo: string;
        estado: CuotaEstado;
      }
    | null;
  if (!cuota) return { ok: false, error: "Cuota no encontrada" };
  if (cuota.estado === "pagada") {
    return { ok: false, error: "La cuota ya estaba marcada como pagada" };
  }
  if (cuota.estado === "cancelada") {
    return { ok: false, error: "No se puede pagar una cuota cancelada" };
  }

  const { data: pagoInserted, error: pagoErr } = await supabase
    .from("pagos")
    .insert({
      cliente_id: cuota.cliente_id,
      contrato_id: cuota.contrato_id,
      monto: input.monto_real,
      moneda: input.moneda || "USD",
      metodo: input.metodo,
      etapa: `Cuota ${cuota.periodo}`,
      fecha_pago: input.fecha_pago,
      comprobante_url: input.comprobante_url ?? null,
      notas: input.notas ?? null,
      visible_cliente: true,
      tipo_cambio_aplicado:
        input.tipo_cambio_aplicado &&
        Number.isFinite(input.tipo_cambio_aplicado) &&
        input.tipo_cambio_aplicado > 0
          ? input.tipo_cambio_aplicado
          : null,
      created_by: guard.userId,
    })
    .select("id")
    .single();
  if (pagoErr) return { ok: false, error: pagoErr.message };
  const pagoId = (pagoInserted as { id: string }).id;

  const ahora = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("cuotas_mensuales")
    .update({
      estado: "pagada",
      pagada_at: ahora,
      pago_id: pagoId,
    })
    .eq("id", cuota.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/cobros");
  return { ok: true, data: { pago_id: pagoId } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar cuota
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelarCuota(input: {
  cuota_id: string;
  motivo?: string | null;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const motivoTxt = (input.motivo ?? "").trim();

  const { data: cuotaRow } = await supabase
    .from("cuotas_mensuales")
    .select("id, estado, notas")
    .eq("id", input.cuota_id)
    .maybeSingle();
  const cuota = cuotaRow as
    | { id: string; estado: CuotaEstado; notas: string | null }
    | null;
  if (!cuota) return { ok: false, error: "Cuota no encontrada" };
  if (cuota.estado === "pagada") {
    return { ok: false, error: "No se puede cancelar una cuota pagada" };
  }

  const notas =
    motivoTxt.length > 0
      ? cuota.notas
        ? `${cuota.notas}\n[Cancelada] ${motivoTxt}`
        : `[Cancelada] ${motivoTxt}`
      : cuota.notas;

  const { error } = await supabase
    .from("cuotas_mensuales")
    .update({
      estado: "cancelada",
      notas,
    })
    .eq("id", cuota.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/cobros");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTemplateContext(
  cuota: Record<string, unknown>,
  cliente: { nombre: string; empresa: string | null } | null,
  agency: Record<string, unknown> | null,
  tcOficial: number | null,
): Record<string, unknown> {
  const montoUSD = Number(cuota.monto_usd ?? 0);
  const montoARS = tcOficial && tcOficial > 0 ? montoUSD * tcOficial : null;
  const tieneARS = montoARS !== null;
  return {
    cliente: {
      nombre: cliente?.nombre ?? "",
      empresa: cliente?.empresa ?? "",
    },
    cuota: {
      monto_usd: formatUSD(montoUSD),
      monto_ars: tieneARS ? formatARS(montoARS!) : "",
      tiene_ars: tieneARS,
      rango_inicio: formatFechaDDMM(cuota.fecha_recordatorio_1 as string),
      rango_fin: formatFechaDDMM(cuota.fecha_vencimiento as string),
      vencimiento_largo: formatFechaCorta(cuota.fecha_vencimiento as string),
      ultimo_recordatorio:
        cuota.recordatorio_2_enviado_at ?? cuota.recordatorio_1_enviado_at ?? "—",
    },
    agency: {
      banco: agency?.banco ?? "Banco Patagonia",
      cbu_pesos: agency?.cbu_pesos ?? "",
      alias_pesos: agency?.alias_pesos ?? "",
      cvu_usd: agency?.cvu_usd ?? "",
      alias_usd: agency?.alias_usd ?? "",
      cuil: agency?.cuil ?? "",
    },
    mp: { link: "" },
  };
}
