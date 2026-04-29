/**
 * POST /api/webhook/mercadopago
 *
 * Recibe el IPN/webhook de MercadoPago. Cuando llega un evento de tipo
 * "payment", consultamos el pago vía SDK para verificar el estado real
 * (no confiamos en el body del webhook, que no está firmado).
 *
 * Si el pago está "approved":
 *   1. Buscamos la cuota por external_reference (= cuota_id).
 *   2. Marcamos la cuota como 'pagada' (estado, pagada_at).
 *   3. Insertamos un pago en `pagos` con mp_payment_id, mp_status, monto y método.
 *
 * MercadoPago manda el webhook como query string (`?type=payment&data.id=...`)
 * o como body JSON. Soportamos ambos.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache",
};

interface MPWebhookBody {
  type?: string;
  action?: string;
  data?: { id?: string | number };
  resource?: string;
  topic?: string;
}

function extractPaymentId(req: NextRequest, body: MPWebhookBody | null): string | null {
  // Query params (forma legacy)
  const sp = req.nextUrl.searchParams;
  const qsType = sp.get("type") ?? sp.get("topic");
  const qsId = sp.get("data.id") ?? sp.get("id");
  if (qsType && qsType.toLowerCase().includes("payment") && qsId) {
    return String(qsId);
  }

  // Body JSON (forma moderna)
  if (body) {
    const t = (body.type ?? body.topic ?? "").toLowerCase();
    if (t.includes("payment") && body.data?.id !== undefined) {
      return String(body.data.id);
    }
    // Algunas versiones mandan resource como URL ".../payments/{id}"
    if (typeof body.resource === "string") {
      const m = body.resource.match(/\/payments\/(\d+)/);
      if (m) return m[1] ?? null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: MPWebhookBody | null = null;
  try {
    body = (await req.json()) as MPWebhookBody;
  } catch {
    body = null;
  }

  const paymentId = extractPaymentId(req, body);
  if (!paymentId) {
    // Otros tipos de eventos (merchant_order, etc.) — ignoramos.
    return NextResponse.json(
      { ok: true, skipped: "no_payment_id" },
      { status: 200, headers: NO_STORE },
    );
  }

  const result = await getPayment(paymentId);
  if (!result.ok) {
    return NextResponse.json(
      { error: "mp_get_failed", detail: result.error },
      { status: 502, headers: NO_STORE },
    );
  }

  if (result.status !== "approved") {
    // Sólo actuamos cuando el pago es aprobado. Para "pending" o "rejected"
    // ignoramos (MP volverá a notificar cuando cambie el estado).
    return NextResponse.json(
      {
        ok: true,
        skipped: "not_approved",
        status: result.status,
        payment_id: paymentId,
      },
      { status: 200, headers: NO_STORE },
    );
  }

  const cuotaId = result.external_reference;
  if (!cuotaId) {
    return NextResponse.json(
      { error: "no_external_reference", payment_id: paymentId },
      { status: 400, headers: NO_STORE },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: "service_role_missing", detail: String(err) },
      { status: 500, headers: NO_STORE },
    );
  }

  // Buscar la cuota
  const { data: cuotaRow } = await admin
    .from("cuotas_mensuales")
    .select(
      "id, contrato_id, cliente_id, monto_usd, periodo, estado, pago_id",
    )
    .eq("id", cuotaId)
    .maybeSingle();
  const cuota = cuotaRow as
    | {
        id: string;
        contrato_id: string;
        cliente_id: string;
        monto_usd: number;
        periodo: string;
        estado: string;
        pago_id: string | null;
      }
    | null;

  if (!cuota) {
    return NextResponse.json(
      { error: "cuota_not_found", cuota_id: cuotaId },
      { status: 404, headers: NO_STORE },
    );
  }

  // Idempotencia: si ya está pagada y vinculada a un pago, sólo actualizamos mp_*
  if (cuota.estado === "pagada" && cuota.pago_id) {
    await admin
      .from("pagos")
      .update({
        mp_payment_id: paymentId,
        mp_status: result.status,
      })
      .eq("id", cuota.pago_id);
    return NextResponse.json(
      { ok: true, idempotent: true, cuota_id: cuotaId, payment_id: paymentId },
      { status: 200, headers: NO_STORE },
    );
  }

  const ahora = new Date().toISOString();
  const fechaHoy = ahora.slice(0, 10);

  // Insertar pago
  const moneda = result.currency_id ?? "ARS";
  const monto =
    typeof result.amount === "number" && result.amount > 0
      ? result.amount
      : Number(cuota.monto_usd ?? 0);

  const { data: pagoInserted, error: insertErr } = await admin
    .from("pagos")
    .insert({
      cliente_id: cuota.cliente_id,
      contrato_id: cuota.contrato_id,
      monto,
      moneda,
      metodo: "mercadopago",
      etapa: `Cuota ${cuota.periodo}`,
      fecha_pago: fechaHoy,
      visible_cliente: true,
      mp_payment_id: paymentId,
      mp_status: result.status,
      notas: "Pago confirmado vía webhook de MercadoPago",
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: "pago_insert_failed", detail: insertErr.message },
      { status: 500, headers: NO_STORE },
    );
  }

  const pagoId = (pagoInserted as { id: string } | null)?.id ?? null;

  // Marcar la cuota como pagada
  await admin
    .from("cuotas_mensuales")
    .update({
      estado: "pagada",
      pagada_at: ahora,
      pago_id: pagoId,
    })
    .eq("id", cuota.id);

  return NextResponse.json(
    {
      ok: true,
      cuota_id: cuota.id,
      pago_id: pagoId,
      payment_id: paymentId,
      status: result.status,
    },
    { status: 200, headers: NO_STORE },
  );
}

// MP a veces hace GET para verificar el endpoint
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
