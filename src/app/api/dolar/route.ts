/**
 * GET /api/dolar
 *
 * Devuelve la cotización oficial del dólar (BNA) cacheada por 30 minutos.
 * Lo usa la UI para pre-llenar el campo "tipo de cambio" cuando el admin
 * registra un pago en una moneda distinta a la del contrato.
 *
 * Es público porque la cotización del dólar es información pública. No
 * requiere auth.
 */

import { NextResponse } from "next/server";

import { fetchCotizacionDolar } from "@/lib/cambio";

export const dynamic = "force-dynamic";

export async function GET() {
  const cot = await fetchCotizacionDolar();
  if (!cot) {
    return NextResponse.json(
      { error: "no_data", mensaje: "No se pudo obtener la cotización del BNA" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return NextResponse.json(cot, {
    status: 200,
    headers: {
      // Le decimos al browser que cachee 5 min, y al edge 30 min
      "Cache-Control": "public, max-age=300, s-maxage=1800",
    },
  });
}
