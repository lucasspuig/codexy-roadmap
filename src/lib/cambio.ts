// Helpers de conversión USD ↔ ARS para multi-moneda.
//
// Fuente del tipo de cambio: dolarapi.com (que mirrorea las cotizaciones del
// BNA). El tipo "oficial" es el que usamos para liquidar contratos en USD
// pagados en ARS. La cotización se cachea en memoria del server por 30
// minutos para evitar pegarle a la API en cada request.
//
// Convención: tipoCambio = 1 USD en ARS. Ej: 1350 → USD 1 == ARS 1.350.

import type { Pago } from "@/types/pagos";

export interface CotizacionDolar {
  /** 1 USD = X ARS — promedio entre compra y venta del oficial */
  promedio: number;
  compra: number;
  venta: number;
  /** ISO timestamp del último update reportado por la API */
  fecha_actualizacion: string;
  fuente: string;
}

interface DolarApiResponse {
  compra?: number;
  venta?: number;
  fechaActualizacion?: string;
  nombre?: string;
  casa?: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
let cache: { value: CotizacionDolar; expires: number } | null = null;

/**
 * Pega a dolarapi.com para obtener el dólar oficial (BNA). Cacheado por
 * 30 minutos en memoria del server. Si la API está caída, devuelve el
 * último valor cacheado aunque haya expirado, o null si nunca cargó.
 */
export async function fetchCotizacionDolar(): Promise<CotizacionDolar | null> {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return cache.value;
  }
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      // Importante: el handler runs en el server, no usamos cookies/credentials
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return cache?.value ?? null;
    }
    const data = (await res.json()) as DolarApiResponse;
    if (
      typeof data.compra !== "number" ||
      typeof data.venta !== "number"
    ) {
      return cache?.value ?? null;
    }
    const value: CotizacionDolar = {
      compra: data.compra,
      venta: data.venta,
      promedio: round4((data.compra + data.venta) / 2),
      fecha_actualizacion: data.fechaActualizacion ?? new Date().toISOString(),
      fuente: data.nombre ?? "Dólar oficial (BNA)",
    };
    cache = { value, expires: now + CACHE_TTL_MS };
    return value;
  } catch {
    return cache?.value ?? null;
  }
}

/**
 * Convierte un monto entre monedas usando un tipo de cambio dado.
 * Si las monedas coinciden, devuelve el monto sin cambios.
 */
export function convertirMonto(
  monto: number,
  fromMoneda: string,
  toMoneda: string,
  tipoCambio: number, // 1 USD = X ARS
): number {
  if (fromMoneda === toMoneda) return monto;
  if (!tipoCambio || tipoCambio <= 0) return monto;
  if (fromMoneda === "USD" && toMoneda === "ARS") {
    return monto * tipoCambio;
  }
  if (fromMoneda === "ARS" && toMoneda === "USD") {
    return monto / tipoCambio;
  }
  // Otros pares no soportados — devolvemos el monto sin tocar
  return monto;
}

/**
 * Devuelve el monto del pago expresado en la moneda del contrato.
 * Si el pago está en la misma moneda → no convierte.
 * Si está en distinta y tiene tipo_cambio_aplicado → convierte usando ese.
 * Si está en distinta y NO tiene tipo_cambio_aplicado → asume 1:1 (caso degradado).
 */
export function pagoEnMonedaContrato(
  pago: Pick<Pago, "monto" | "moneda" | "tipo_cambio_aplicado">,
  monedaContrato: string,
): number {
  if (pago.moneda === monedaContrato) return Number(pago.monto || 0);
  const tc = pago.tipo_cambio_aplicado ?? 0;
  if (tc <= 0) {
    // Sin tipo de cambio capturado, no podemos convertir con confianza.
    // Devolvemos el monto crudo como degradación ordenada (mostrará una
    // inconsistencia en saldo, mejor que ocultar el pago).
    return Number(pago.monto || 0);
  }
  return convertirMonto(
    Number(pago.monto || 0),
    pago.moneda,
    monedaContrato,
    tc,
  );
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function formatTipoCambio(tc: number | null | undefined): string {
  if (!tc || tc <= 0) return "—";
  return `1 USD = ARS ${new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(tc)}`;
}
