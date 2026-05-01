/**
 * GET / POST /api/cron/cobros
 *
 * Endpoint que se llama una vez al día (Easypanel Cron / curl externo).
 * Procesa el ciclo de cobros completo:
 *
 *   1. Cuotas con fecha_recordatorio_1 == hoy y estado pendiente
 *      → mandar Recordatorio 1 → marcar estado = 'recordada_1'
 *   2. Cuotas con fecha_recordatorio_2 == hoy y estado in (pendiente, recordada_1)
 *      → mandar Recordatorio 2 → marcar estado = 'recordada_2'
 *   3. Cuotas con fecha_escalacion == hoy y estado != 'pagada'
 *      → mandar mensaje al CEO/admin → marcar estado = 'escalada'
 *
 * Auth: header `X-Cron-Secret` con el valor de CRON_SECRET (env var).
 *
 * Respuesta:
 *   { ok: true, recordatorio_1: N, recordatorio_2: M, escalaciones: K, errores: [] }
 *
 * Si Evolution API no está configurada, igual marca las cuotas como
 * "intentadas" pero registra el fallo en mensajes_enviados.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { fetchCotizacionDolar } from "@/lib/cambio";
import {
  formatARS,
  formatFechaCorta,
  formatFechaDDMM,
  formatUSD,
} from "@/lib/cuotas";
import { normalizePhone, sendWhatsapp } from "@/lib/evolution-api";
import { renderTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache",
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

interface RunReport {
  ok: boolean;
  fecha: string;
  recordatorio_1: number;
  recordatorio_2: number;
  escalaciones: number;
  errores: Array<{ cuota_id: string; error: string }>;
}

async function processCobros(): Promise<RunReport> {
  const sb = admin();
  if (!sb) {
    return {
      ok: false,
      fecha: new Date().toISOString(),
      recordatorio_1: 0,
      recordatorio_2: 0,
      escalaciones: 0,
      errores: [{ cuota_id: "-", error: "Service role key no configurada" }],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const report: RunReport = {
    ok: true,
    fecha: today,
    recordatorio_1: 0,
    recordatorio_2: 0,
    escalaciones: 0,
    errores: [],
  };

  // Datos comunes
  const [{ data: agencyRow }, { data: tplRows }, cotizacion] =
    await Promise.all([
      sb.from("agency_payment_data").select("*").eq("id", 1).maybeSingle(),
      sb.from("mensaje_templates").select("*").eq("activo", true),
      fetchCotizacionDolar(),
    ]);
  const agency = agencyRow as Record<string, unknown> | null;
  const templates = (tplRows ?? []) as Array<{
    id: string;
    cuerpo: string;
  }>;
  const tplById = new Map(templates.map((t) => [t.id, t.cuerpo]));

  // ── 1. RECORDATORIO 1 ────────────────────────────────────
  const r1 = await sb
    .from("cuotas_mensuales")
    .select("*, clientes:clientes(id, nombre, telefono)")
    .eq("fecha_recordatorio_1", today)
    .eq("estado", "pendiente");
  for (const cuota of (r1.data ?? []) as Array<Record<string, unknown>>) {
    const cliente = cuota.clientes as
      | { id: string; nombre: string; telefono: string | null }
      | null;
    if (!cliente?.telefono) {
      report.errores.push({
        cuota_id: cuota.id as string,
        error: "Cliente sin teléfono",
      });
      continue;
    }
    const tpl = tplById.get("recordatorio_1");
    if (!tpl) continue;
    const ctx = buildContext(cuota, cliente, agency, cotizacion?.cobro ?? null);
    const cuerpo = renderTemplate(tpl, ctx);

    const result = await sendWhatsapp({
      telefono: cliente.telefono,
      mensaje: cuerpo,
    });

    await sb.from("mensajes_enviados").insert({
      cliente_id: cliente.id,
      cuota_id: cuota.id,
      template_id: "recordatorio_1",
      telefono_destino: normalizePhone(cliente.telefono) ?? cliente.telefono,
      cuerpo,
      estado: result.ok ? "enviado" : "fallido",
      error: result.error ?? null,
      evolution_response: (result.payload as object) ?? null,
    });

    if (result.ok) {
      await sb
        .from("cuotas_mensuales")
        .update({
          estado: "recordada_1",
          recordatorio_1_enviado_at: new Date().toISOString(),
        })
        .eq("id", cuota.id as string);
      report.recordatorio_1 += 1;
    } else {
      report.errores.push({
        cuota_id: cuota.id as string,
        error: result.error ?? "Envío fallido",
      });
    }
  }

  // ── 2. RECORDATORIO 2 ────────────────────────────────────
  const r2 = await sb
    .from("cuotas_mensuales")
    .select("*, clientes:clientes(id, nombre, telefono)")
    .eq("fecha_recordatorio_2", today)
    .in("estado", ["pendiente", "recordada_1"]);
  for (const cuota of (r2.data ?? []) as Array<Record<string, unknown>>) {
    const cliente = cuota.clientes as
      | { id: string; nombre: string; telefono: string | null }
      | null;
    if (!cliente?.telefono) continue;
    const tpl = tplById.get("recordatorio_2");
    if (!tpl) continue;
    const ctx = buildContext(cuota, cliente, agency, cotizacion?.cobro ?? null);
    const cuerpo = renderTemplate(tpl, ctx);

    const result = await sendWhatsapp({
      telefono: cliente.telefono,
      mensaje: cuerpo,
    });

    await sb.from("mensajes_enviados").insert({
      cliente_id: cliente.id,
      cuota_id: cuota.id,
      template_id: "recordatorio_2",
      telefono_destino: normalizePhone(cliente.telefono) ?? cliente.telefono,
      cuerpo,
      estado: result.ok ? "enviado" : "fallido",
      error: result.error ?? null,
      evolution_response: (result.payload as object) ?? null,
    });

    if (result.ok) {
      await sb
        .from("cuotas_mensuales")
        .update({
          estado: "recordada_2",
          recordatorio_2_enviado_at: new Date().toISOString(),
        })
        .eq("id", cuota.id as string);
      report.recordatorio_2 += 1;
    } else {
      report.errores.push({
        cuota_id: cuota.id as string,
        error: result.error ?? "Envío fallido",
      });
    }
  }

  // ── 3. ESCALACIÓN ────────────────────────────────────────
  const numeroEscalacion =
    typeof agency?.numero_escalacion === "string"
      ? (agency.numero_escalacion as string)
      : null;
  if (numeroEscalacion) {
    const e1 = await sb
      .from("cuotas_mensuales")
      .select("*, clientes:clientes(id, nombre, telefono, empresa)")
      .eq("fecha_escalacion", today)
      .in("estado", ["pendiente", "recordada_1", "recordada_2"]);
    for (const cuota of (e1.data ?? []) as Array<Record<string, unknown>>) {
      const cliente = cuota.clientes as
        | { id: string; nombre: string; empresa: string | null }
        | null;
      if (!cliente) continue;
      const tpl = tplById.get("escalacion_admin");
      if (!tpl) continue;
      const ctx = buildContext(cuota, cliente, agency, cotizacion?.cobro ?? null);
      // contexto extra para escalación
      (ctx.admin as Record<string, unknown>) = {
        url_cliente: `https://plan.codexyoficial.com/dashboard?cliente=${cliente.id}`,
      };
      const cuerpo = renderTemplate(tpl, ctx);

      const result = await sendWhatsapp({
        telefono: numeroEscalacion,
        mensaje: cuerpo,
      });

      await sb.from("mensajes_enviados").insert({
        cliente_id: cliente.id,
        cuota_id: cuota.id,
        template_id: "escalacion_admin",
        telefono_destino:
          normalizePhone(numeroEscalacion) ?? numeroEscalacion,
        cuerpo,
        estado: result.ok ? "enviado" : "fallido",
        error: result.error ?? null,
        evolution_response: (result.payload as object) ?? null,
      });

      if (result.ok) {
        await sb
          .from("cuotas_mensuales")
          .update({
            estado: "escalada",
            escalada_at: new Date().toISOString(),
            escalacion_enviada_at: new Date().toISOString(),
          })
          .eq("id", cuota.id as string);
        report.escalaciones += 1;
      } else {
        report.errores.push({
          cuota_id: cuota.id as string,
          error: result.error ?? "Envío fallido",
        });
      }
    }
  }

  return report;
}

/** Construye el contexto que renderTemplate va a inyectar. */
function buildContext(
  cuota: Record<string, unknown>,
  cliente: Record<string, unknown> | null,
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
    mp: {
      // El link de MP se llena después cuando integremos. Por ahora vacío.
      link: "",
    },
  };
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  const report = await processCobros();
  return NextResponse.json(report, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
