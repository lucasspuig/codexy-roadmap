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
  const ctx = buildTemplateContext(cuota, cliente, agency, cotizacion?.cobro ?? null);
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
// Crear cobro independiente: cliente + contrato de mantenimiento + 12 cuotas
// (flujo "rápido" para mantenimientos que no salen del CRM).
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearCobroIndependienteInput {
  nombre: string;
  telefono: string;
  empresa?: string | null;
  cuota_mensual: number;
  dia_cobro?: number;
  recordatorios_activos?: boolean;
  /**
   * Si true: la primera cuota se genera para el MES EN CURSO.
   * Si false (default): para el mes siguiente al de la firma.
   */
  iniciar_mes_actual?: boolean;
}

export async function crearCobroIndependiente(
  input: CrearCobroIndependienteInput,
): Promise<
  ActionResult<{
    cliente_id: string;
    contrato_id: string;
    cuotas_generadas: number;
  }>
> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const nombre = (input.nombre ?? "").trim();
  if (nombre.length < 2) {
    return { ok: false, error: "Nombre del cliente requerido" };
  }
  const empresa = (input.empresa ?? "").trim() || null;
  const cuota = Number(input.cuota_mensual);
  if (!Number.isFinite(cuota) || cuota <= 0) {
    return { ok: false, error: "Cuota mensual inválida" };
  }
  const diaCobro = clampDia(input.dia_cobro ?? 9);
  const telefonoNorm = normalizePhone(input.telefono ?? "");
  if (!telefonoNorm) {
    return {
      ok: false,
      error: "Teléfono inválido (usá formato internacional, ej: +5491131245678)",
    };
  }

  const supabase = await createClient();

  // 1) Buscar cliente por teléfono normalizado o crear uno nuevo
  // Como el campo telefono no está normalizado en DB, comparamos con regex o
  // simplemente buscamos cualquier cliente que tenga ese teléfono "limpio".
  let clienteId: string | null = null;
  {
    const { data: existing } = await supabase
      .from("clientes")
      .select("id, telefono")
      .not("telefono", "is", null);
    const list =
      (existing as Array<{ id: string; telefono: string | null }> | null) ?? [];
    const match = list.find(
      (c) => normalizePhone(c.telefono ?? "") === telefonoNorm,
    );
    if (match) clienteId = match.id;
  }
  if (!clienteId) {
    const insertPayload: Record<string, unknown> = {
      nombre,
      empresa,
      telefono: telefonoNorm,
      tipo: "cobro_directo",
      estado_venta: "ganado",
      origen: "cobro_directo",
    };
    const { data: inserted, error: insErr } = await supabase
      .from("clientes")
      .insert(insertPayload as never)
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    clienteId = (inserted as { id: string }).id;
  }

  // 2) Generar el número de contrato
  const { data: numData, error: numErr } = await supabase.rpc(
    "generate_contrato_numero" as never,
  );
  if (numErr) return { ok: false, error: numErr.message };
  const numero = (numData as unknown as string) ?? `CTX-${new Date().getFullYear()}-001`;

  // 3) Crear el contrato directamente como firmado_completo. NO disparamos
  // el trigger AFTER UPDATE — generamos las cuotas manualmente con el flag
  // `iniciar_mes_actual` que pidió el admin.
  const hoy = new Date();
  const hoyDate = hoy.toISOString().slice(0, 10);
  const hoyTs = hoy.toISOString();
  const tituloDefault = `Cobro mensual · ${nombre}`;

  const { data: contInserted, error: contErr } = await supabase
    .from("contratos")
    .insert({
      numero,
      cliente_id: clienteId,
      tipo: "mantenimiento",
      estado: "firmado_completo",
      servicio_titulo: tituloDefault,
      modalidad_pago: "mensual",
      monto_total: cuota * 12,
      moneda: "USD",
      mantenimiento_mensual: cuota,
      fecha_emision: hoyDate,
      fecha_envio_cliente: hoyTs,
      fecha_firma_prestador: hoyTs,
      fecha_firma_cliente: hoyTs,
      fecha_firmado_completo: hoyTs,
      dia_cobro: diaCobro,
      detalle_pagos: [
        {
          etapa: "Cuota mensual",
          monto: cuota,
          descripcion: `Día ${diaCobro} de cada mes — USD ${cuota}`,
        },
      ],
      notas_internas: input.recordatorios_activos === false
        ? "[cobro_directo] Recordatorios automáticos desactivados"
        : "[cobro_directo] Cliente creado vía Cobros · recordatorios automáticos activos",
      created_by: guard.userId,
    })
    .select("id")
    .single();
  if (contErr) return { ok: false, error: contErr.message };
  const contratoId = (contInserted as { id: string }).id;

  // 4) Generar las cuotas para los próximos 12 meses con el flag pedido.
  const { error: rpcErr } = await supabase.rpc(
    "generate_cuotas_para_contrato" as never,
    {
      p_contrato_id: contratoId,
      p_meses: 12,
      p_iniciar_mes_actual: input.iniciar_mes_actual === true,
    } as never,
  );
  if (rpcErr) {
    return { ok: false, error: `Cuotas: ${rpcErr.message}` };
  }

  // 5) Contar cuotas generadas
  const { count } = await supabase
    .from("cuotas_mensuales")
    .select("id", { count: "exact", head: true })
    .eq("contrato_id", contratoId);

  revalidatePath("/cobros");
  return {
    ok: true,
    data: {
      cliente_id: clienteId,
      contrato_id: contratoId,
      cuotas_generadas: count ?? 0,
    },
  };
}

function clampDia(v: number | string): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : v;
  if (!Number.isFinite(n)) return 9;
  if (n < 1) return 1;
  if (n > 28) return 28;
  return Math.trunc(n);
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

// ─────────────────────────────────────────────────────────────────────────────
// Aumento de tarifa masivo
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteConCobro {
  cliente_id: string;
  cliente_nombre: string;
  cliente_empresa: string | null;
  cliente_telefono: string | null;
  contrato_id: string;
  contrato_numero: string;
  monto_actual_usd: number;
}

/**
 * Lista los clientes que tienen un contrato activo con mantenimiento mensual.
 * Para el modal de "Comunicar aumento".
 */
export async function listClientesConCobroActivo(): Promise<
  ActionResult<ClienteConCobro[]>
> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, numero, mantenimiento_mensual, cliente_id, clientes:clientes(id, nombre, empresa, telefono)",
    )
    .in("estado", ["enviado", "firmado_cliente", "firmado_completo"])
    .gt("mantenimiento_mensual", 0)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    numero: string;
    mantenimiento_mensual: number;
    cliente_id: string;
    clientes: {
      id: string;
      nombre: string;
      empresa: string | null;
      telefono: string | null;
    } | null;
  }>;

  const result: ClienteConCobro[] = rows
    .filter((r) => r.clientes != null)
    .map((r) => ({
      cliente_id: r.clientes!.id,
      cliente_nombre: r.clientes!.nombre,
      cliente_empresa: r.clientes!.empresa,
      cliente_telefono: r.clientes!.telefono,
      contrato_id: r.id,
      contrato_numero: r.numero,
      monto_actual_usd: Number(r.mantenimiento_mensual ?? 0),
    }));

  return { ok: true, data: result };
}

export interface AumentoInput {
  /** Cantidad en USD que se SUMA al monto actual (puede ser positivo o negativo). */
  delta_usd: number;
  /** Período desde el que aplica, formato 'YYYY-MM' (ej: '2026-06'). */
  periodo_desde: string;
  /** IDs de los contratos a los que aplicar. Si vacío → falla. */
  contrato_ids: string[];
}

export interface AumentoResultadoCliente {
  contrato_id: string;
  cliente_nombre: string;
  ok: boolean;
  monto_anterior?: number;
  monto_nuevo?: number;
  cuotas_actualizadas?: number;
  wa_enviado?: boolean;
  error?: string;
}

/**
 * Aplica un aumento masivo: para cada contrato seleccionado:
 *   1. Llama al RPC aplicar_aumento_tarifa (actualiza contrato + cuotas)
 *   2. Manda el WA con template aviso_aumento al cliente
 *   3. Audita en mensajes_enviados
 */
export async function comunicarAumentoMasivo(
  input: AumentoInput,
): Promise<ActionResult<{ resultados: AumentoResultadoCliente[] }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const delta = Number(input.delta_usd);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "Delta debe ser distinto de 0" };
  }
  if (!input.periodo_desde || !/^\d{4}-\d{2}$/.test(input.periodo_desde)) {
    return { ok: false, error: "Período inválido (formato YYYY-MM)" };
  }
  if (!Array.isArray(input.contrato_ids) || input.contrato_ids.length === 0) {
    return { ok: false, error: "Seleccioná al menos un cliente" };
  }

  const supabase = await createClient();

  // Levantar template + cotización + datos comunes
  const [{ data: tplRow }, cotizacion] = await Promise.all([
    supabase
      .from("mensaje_templates")
      .select("cuerpo")
      .eq("id", "aviso_aumento")
      .eq("activo", true)
      .maybeSingle(),
    fetchCotizacionDolar(),
  ]);
  const cuerpoTpl = (tplRow as { cuerpo: string } | null)?.cuerpo;
  if (!cuerpoTpl) {
    return {
      ok: false,
      error: "Template aviso_aumento no encontrado o inactivo",
    };
  }
  const tcOficial = cotizacion?.cobro ?? null;

  // Date helpers para "Mes Año" y "DD/MM/YYYY"
  const [yStr, mStr] = input.periodo_desde.split("-");
  const yNum = Number(yStr);
  const mNum = Number(mStr);
  const fechaPrimerCobro = (() => {
    // El día de cobro lo sacamos de cada contrato individualmente
    return null as unknown as string;
  });
  void fechaPrimerCobro;

  const mesAplicaLabel = new Date(Date.UTC(yNum, mNum - 1, 1))
    .toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
    .replace(/^./, (c) => c.toUpperCase());

  // Iterar contratos
  const resultados: AumentoResultadoCliente[] = [];
  for (const contratoId of input.contrato_ids) {
    // Datos del contrato + cliente
    const { data: contRow, error: contErr } = await supabase
      .from("contratos")
      .select(
        "id, mantenimiento_mensual, dia_cobro, cliente_id, clientes:clientes(nombre, empresa, telefono)",
      )
      .eq("id", contratoId)
      .single();

    const cont = contRow as unknown as {
      id: string;
      mantenimiento_mensual: number;
      dia_cobro: number;
      cliente_id: string;
      clientes: {
        nombre: string;
        empresa: string | null;
        telefono: string | null;
      } | null;
    } | null;

    if (contErr || !cont || !cont.clientes) {
      resultados.push({
        contrato_id: contratoId,
        cliente_nombre: "(no encontrado)",
        ok: false,
        error: contErr?.message ?? "Contrato/cliente no encontrado",
      });
      continue;
    }

    const montoActual = Number(cont.mantenimiento_mensual ?? 0);
    const montoNuevo = montoActual + delta;
    if (montoNuevo <= 0) {
      resultados.push({
        contrato_id: contratoId,
        cliente_nombre: cont.clientes.nombre,
        ok: false,
        error: "El monto resultante sería <= 0",
      });
      continue;
    }

    // 1) RPC: aplicar el aumento (contrato + cuotas)
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "aplicar_aumento_tarifa" as never,
      {
        p_contrato_id: contratoId,
        p_nuevo_monto_usd: montoNuevo,
        p_periodo_desde: input.periodo_desde,
      } as never,
    );
    if (rpcErr) {
      resultados.push({
        contrato_id: contratoId,
        cliente_nombre: cont.clientes.nombre,
        ok: false,
        error: rpcErr.message,
      });
      continue;
    }
    const rpcRes =
      (rpcData as { cuotas_actualizadas?: number } | null) ?? {};

    // 2) Mandar WA con el template renderizado
    let waEnviado = false;
    let waError: string | null = null;

    if (cont.clientes.telefono) {
      const fechaPrimerCobroIso = `${input.periodo_desde}-${String(cont.dia_cobro ?? 9).padStart(2, "0")}`;
      const ctx: Record<string, unknown> = {
        cliente: {
          nombre: cont.clientes.nombre,
          empresa: cont.clientes.empresa ?? "",
        },
        ajuste: {
          delta: formatUSD(Math.abs(delta)),
          mes_aplica: mesAplicaLabel,
          monto_actual_usd: formatUSD(montoActual),
          monto_nuevo_usd: formatUSD(montoNuevo),
          monto_actual_ars:
            tcOficial && tcOficial > 0
              ? formatARS(montoActual * tcOficial)
              : "",
          monto_nuevo_ars:
            tcOficial && tcOficial > 0
              ? formatARS(montoNuevo * tcOficial)
              : "",
          tiene_ars_actual: !!(tcOficial && tcOficial > 0),
          tiene_ars_nuevo: !!(tcOficial && tcOficial > 0),
          fecha_primer_cobro: formatFechaCorta(fechaPrimerCobroIso),
        },
      };
      const cuerpoFinal = renderTemplate(cuerpoTpl, ctx);
      const sendRes = await sendWhatsapp({
        telefono: cont.clientes.telefono,
        mensaje: cuerpoFinal,
      });
      waEnviado = sendRes.ok;
      waError = sendRes.error ?? null;

      // Audit
      await supabase.from("mensajes_enviados").insert({
        cliente_id: cont.cliente_id,
        cuota_id: null,
        template_id: "aviso_aumento",
        telefono_destino:
          normalizePhone(cont.clientes.telefono) ?? cont.clientes.telefono,
        cuerpo: cuerpoFinal,
        estado: sendRes.ok ? "enviado" : "fallido",
        error: sendRes.error ?? null,
        evolution_response: (sendRes.payload as object) ?? null,
      });
    }

    resultados.push({
      contrato_id: contratoId,
      cliente_nombre: cont.clientes.nombre,
      ok: true,
      monto_anterior: montoActual,
      monto_nuevo: montoNuevo,
      cuotas_actualizadas: Number(rpcRes.cuotas_actualizadas ?? 0),
      wa_enviado: waEnviado,
      error: waError ?? undefined,
    });
  }

  revalidatePath("/cobros");
  return { ok: true, data: { resultados } };
}
