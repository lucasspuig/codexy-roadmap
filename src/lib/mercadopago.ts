// Wrapper para MercadoPago — creación de preferencias y consulta de pagos.
//
// El access token se lee de la tabla `agency_payment_data` (id=1) — así el
// admin lo puede rotar desde la UI sin re-deployar. Si la columna está vacía
// caemos al env var MP_ACCESS_TOKEN como fallback.
//
// Convención de monedas:
//   - Si `currencyMode` es 'ARS' (default): convertimos USD → ARS con tcOficial
//     antes de mandar a MP. MP en Argentina sólo acepta ARS para pagos locales.
//   - Si `currencyMode` es 'USD': enviamos en USD (sólo funciona si la cuenta
//     de MP del cliente lo soporta — caso raro en Argentina).

import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

import { createAdminClient } from "@/lib/supabase/admin";

export type MPCurrencyMode = "ARS" | "USD";

export interface CreatePreferenceInput {
  cuota_id: string;
  cliente_nombre: string;
  monto_usd: number;
  /** 1 USD = X ARS. Requerido cuando currencyMode === 'ARS'. */
  tcOficial: number | null;
  currencyMode: MPCurrencyMode;
  /** Opcional: período "YYYY-MM" para incluir en el título del item. */
  periodo?: string;
  /** URL pública del cliente (token). Se usa para back_urls. */
  publicUrl: string;
}

export interface CreatePreferenceResult {
  ok: true;
  id: string;
  init_point: string;
}
export interface CreatePreferenceError {
  ok: false;
  error: string;
}

/** Resuelve el access token: primero DB, luego env var. */
async function resolveAccessToken(): Promise<string | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }
  if (admin) {
    const { data } = await admin
      .from("agency_payment_data")
      .select("mercadopago_access_token, mercadopago_activo")
      .eq("id", 1)
      .maybeSingle();
    const row = data as
      | { mercadopago_access_token: string | null; mercadopago_activo: boolean }
      | null;
    if (row?.mercadopago_activo && row.mercadopago_access_token) {
      return row.mercadopago_access_token;
    }
  }
  const env = process.env.MP_ACCESS_TOKEN;
  return env && env.length > 0 ? env : null;
}

/**
 * Crea una preferencia de pago en MercadoPago para una cuota mensual.
 * Devuelve `init_point` para redirigir al cliente al checkout.
 */
export async function createPreference(
  input: CreatePreferenceInput,
): Promise<CreatePreferenceResult | CreatePreferenceError> {
  const token = await resolveAccessToken();
  if (!token) {
    return {
      ok: false,
      error:
        "MercadoPago no configurado: cargá el access token en /configuracion o seteá MP_ACCESS_TOKEN.",
    };
  }

  const mode = input.currencyMode;
  let unitPrice: number;
  let currencyId: string;

  if (mode === "ARS") {
    if (!input.tcOficial || input.tcOficial <= 0) {
      return {
        ok: false,
        error:
          "Falta cotización del dólar para crear el pago en ARS. Reintentá en unos segundos.",
      };
    }
    unitPrice = round2(input.monto_usd * input.tcOficial);
    currencyId = "ARS";
  } else {
    unitPrice = round2(input.monto_usd);
    currencyId = "USD";
  }

  const titulo = input.periodo
    ? `Mantenimiento Codexy - ${input.periodo}`
    : "Mantenimiento Codexy";

  const baseUrl = (input.publicUrl || "").replace(/\/$/, "");

  const config = new MercadoPagoConfig({
    accessToken: token,
    options: { timeout: 12_000 },
  });
  const preference = new Preference(config);

  try {
    const res = await preference.create({
      body: {
        items: [
          {
            id: input.cuota_id,
            title: titulo,
            description: `Cliente: ${input.cliente_nombre}`,
            quantity: 1,
            unit_price: unitPrice,
            currency_id: currencyId,
          },
        ],
        external_reference: input.cuota_id,
        back_urls: {
          success: `${baseUrl}/exito`,
          failure: `${baseUrl}/error`,
          pending: `${baseUrl}/pendiente`,
        },
        auto_return: "approved",
        notification_url: buildNotificationUrl(),
      },
    });

    if (!res.id || !res.init_point) {
      return {
        ok: false,
        error: "MercadoPago no devolvió id/init_point",
      };
    }
    return { ok: true, id: res.id, init_point: res.init_point };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error desconocido al crear la preferencia de MercadoPago",
    };
  }
}

/**
 * Consulta un pago en MercadoPago por su id. Lo usa el webhook de MP para
 * verificar el estado real del pago antes de marcar la cuota como pagada.
 */
export async function getPayment(paymentId: string | number): Promise<{
  ok: true;
  status: string | null;
  external_reference: string | null;
  amount: number | null;
  currency_id: string | null;
  payment_method_id: string | null;
  raw: Record<string, unknown>;
} | { ok: false; error: string }> {
  const token = await resolveAccessToken();
  if (!token) return { ok: false, error: "MP no configurado" };

  const config = new MercadoPagoConfig({
    accessToken: token,
    options: { timeout: 12_000 },
  });
  const payment = new Payment(config);
  try {
    const res = await payment.get({ id: paymentId });
    const raw = res as unknown as Record<string, unknown>;
    return {
      ok: true,
      status: typeof raw.status === "string" ? (raw.status as string) : null,
      external_reference:
        typeof raw.external_reference === "string"
          ? (raw.external_reference as string)
          : null,
      amount:
        typeof raw.transaction_amount === "number"
          ? (raw.transaction_amount as number)
          : null,
      currency_id:
        typeof raw.currency_id === "string"
          ? (raw.currency_id as string)
          : null,
      payment_method_id:
        typeof raw.payment_method_id === "string"
          ? (raw.payment_method_id as string)
          : null,
      raw,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error desconocido al consultar el pago en MP",
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** URL pública del webhook de MP — armada con NEXT_PUBLIC_APP_URL. */
function buildNotificationUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/webhook/mercadopago`;
}
