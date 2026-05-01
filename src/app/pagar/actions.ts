"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCotizacionDolar } from "@/lib/cambio";
import { createPreference, type MPCurrencyMode } from "@/lib/mercadopago";

import type { PagoPublicoPayload } from "./types";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Crea una preferencia de MercadoPago para una cuota específica y devuelve el
 * init_point al cliente. La página pública la llama desde un form.
 *
 * NO requiere auth: el token público actúa como gate. Valida que la cuota
 * pertenezca al cliente identificado por el token y que esté pendiente.
 */
export async function crearPreferenciaPago(input: {
  token: string;
  cuota_id: string;
  currencyMode?: MPCurrencyMode;
}): Promise<ActionResult<{ init_point: string }>> {
  const token = String(input.token || "").trim();
  if (!token || token.length < 32) {
    return { ok: false, error: "Token inválido" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Configuración del servidor incompleta",
    };
  }

  // Validar token y traer la cuota
  const { data: clienteRow } = await admin
    .from("clientes")
    .select("id, nombre")
    .eq("pago_token", token)
    .maybeSingle();
  const cliente = clienteRow as { id: string; nombre: string } | null;
  if (!cliente) return { ok: false, error: "Token inválido o expirado" };

  const { data: cuotaRow } = await admin
    .from("cuotas_mensuales")
    .select("id, cliente_id, monto_usd, periodo, estado")
    .eq("id", input.cuota_id)
    .maybeSingle();
  const cuota = cuotaRow as
    | {
        id: string;
        cliente_id: string;
        monto_usd: number;
        periodo: string;
        estado: string;
      }
    | null;
  if (!cuota) return { ok: false, error: "Cuota no encontrada" };
  if (cuota.cliente_id !== cliente.id) {
    return { ok: false, error: "Cuota no corresponde al cliente" };
  }
  if (cuota.estado === "pagada") {
    return { ok: false, error: "Esta cuota ya fue pagada" };
  }
  if (cuota.estado === "cancelada") {
    return { ok: false, error: "Esta cuota fue cancelada" };
  }

  const mode: MPCurrencyMode = input.currencyMode ?? "ARS";
  const cotizacion = mode === "ARS" ? await fetchCotizacionDolar() : null;
  const tcOficial = cotizacion?.cobro ?? null;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://plan.codexyoficial.com";
  const publicUrl = `${baseUrl.replace(/\/$/, "")}/pagar/${token}`;

  const result = await createPreference({
    cuota_id: cuota.id,
    cliente_nombre: cliente.nombre,
    monto_usd: Number(cuota.monto_usd ?? 0),
    tcOficial,
    currencyMode: mode,
    periodo: cuota.periodo,
    publicUrl,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Guardamos la preference_id en el contrato sólo si tenemos manera de
  // referenciarla. Como `pagos.mp_preference_id` es por pago concreto, la
  // dejamos para cuando se confirme. Por ahora basta con el init_point.
  void result.id;
  return { ok: true, data: { init_point: result.init_point } };
}

/**
 * Versión que recibe FormData (form action) y redirige al init_point. Útil
 * para que el formulario funcione sin JS habilitado.
 */
export async function pagarConMercadoPagoAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const cuotaId = String(formData.get("cuota_id") ?? "");
  const mode = (String(formData.get("mode") ?? "ARS") as MPCurrencyMode) || "ARS";

  const res = await crearPreferenciaPago({
    token,
    cuota_id: cuotaId,
    currencyMode: mode,
  });
  if (!res.ok) {
    // Redirige a la página /pagar con un mensaje de error
    redirect(`/pagar/${token}?error=${encodeURIComponent(res.error)}`);
  }
  redirect(res.data.init_point);
}

/**
 * Carga el payload público para la página /pagar/[token]. Usa el RPC
 * `get_pago_publico(p_token text)` que valida el token y devuelve cliente +
 * cuotas pendientes + datos de pago de la agencia.
 */
export async function loadPagoPublico(
  token: string,
): Promise<PagoPublicoPayload | null> {
  if (!token || token.length < 16) return null;
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const { data, error } = await admin.rpc("get_pago_publico" as never, {
    p_token: token,
  } as never);
  if (error || !data) return null;
  return data as unknown as PagoPublicoPayload;
}
