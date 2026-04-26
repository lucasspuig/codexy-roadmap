// Cálculo de saldos a partir de contratos y pagos.
// El "facturado" depende de la modalidad: para "mensual"/"unico_mas_mensual"
// crece mes a mes; para "unico"/"50_50"/"custom" es el monto_total upfront.

import type { Contrato } from "@/types/contratos";
import type { ContratoSaldo, Pago, SaldoCliente } from "@/types/pagos";

/**
 * Cuenta meses transcurridos (incluido el mes inicial) entre dos fechas.
 * Se usa para calcular cuántas cuotas mensuales ya están vencidas.
 */
function mesesTranscurridos(desde: string | null, hasta: Date = new Date()): number {
  if (!desde) return 0;
  const d = new Date(desde);
  if (Number.isNaN(d.getTime())) return 0;
  const diffM =
    (hasta.getFullYear() - d.getFullYear()) * 12 +
    (hasta.getMonth() - d.getMonth());
  // +1 porque el día 1 del mes 0 ya hay una cuota vencida
  return Math.max(0, diffM + 1);
}

/**
 * Calcula cuánto debería haberse facturado al cliente sobre este contrato a
 * la fecha dada. Las modalidades mensuales acumulan mes a mes desde fecha_emision.
 */
export function facturadoDeContrato(
  contrato: Pick<
    Contrato,
    | "modalidad_pago"
    | "tipo"
    | "monto_total"
    | "mantenimiento_mensual"
    | "fecha_emision"
    | "fecha_firmado_completo"
    | "estado"
  >,
  hasta: Date = new Date(),
): number {
  // Solo se factura si el contrato fue emitido o firmado
  if (contrato.estado === "borrador" || contrato.estado === "cancelado") {
    return 0;
  }

  const cuota = contrato.mantenimiento_mensual ?? 0;
  const inicio =
    contrato.fecha_firmado_completo ?? contrato.fecha_emision ?? null;
  const meses = mesesTranscurridos(inicio, hasta);

  if (contrato.modalidad_pago === "mensual") {
    return cuota * meses;
  }
  if (contrato.modalidad_pago === "unico_mas_mensual") {
    // Implementación (pago único) + mensualidades vencidas
    return contrato.monto_total + cuota * Math.max(0, meses - 1); // primer mes suele ir con la entrega
  }
  // unico, 50_50, custom: monto total upfront. Si además se cargó una
  // cuota mensual opcional (Implementación + mantenimiento posterior),
  // sumamos las mensualidades vencidas a partir del segundo mes.
  if (cuota > 0) {
    return contrato.monto_total + cuota * Math.max(0, meses - 1);
  }
  return contrato.monto_total;
}

/**
 * Suma los pagos asociados a un contrato.
 */
export function pagadoDeContrato(
  contratoId: string,
  pagos: Pago[],
): number {
  return pagos
    .filter((p) => p.contrato_id === contratoId)
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);
}

/**
 * Construye el saldo per-contrato.
 */
export function saldoDeContrato(
  contrato: Contrato,
  pagos: Pago[],
  hasta: Date = new Date(),
): ContratoSaldo {
  const facturado = facturadoDeContrato(contrato, hasta);
  const pagado = pagadoDeContrato(contrato.id, pagos);
  return {
    contrato_id: contrato.id,
    numero: contrato.numero,
    tipo: contrato.tipo,
    modalidad_pago: contrato.modalidad_pago,
    servicio_titulo: contrato.servicio_titulo,
    monto_total: facturado,
    mantenimiento_mensual: contrato.mantenimiento_mensual,
    moneda: contrato.moneda,
    total_pagado: pagado,
    pendiente: Math.max(0, facturado - pagado),
    pagos: pagos.filter((p) => p.contrato_id === contrato.id),
  };
}

/**
 * Construye el saldo agregado del cliente (suma de todos sus contratos).
 */
export function saldoDeCliente(
  clienteId: string,
  contratos: Contrato[],
  pagos: Pago[],
  hasta: Date = new Date(),
): SaldoCliente {
  const contratosVivos = contratos.filter(
    (c) => c.estado !== "borrador" && c.estado !== "cancelado",
  );
  const desgloses = contratosVivos.map((c) => saldoDeContrato(c, pagos, hasta));
  const moneda = contratosVivos[0]?.moneda ?? "USD";
  const facturado = desgloses.reduce((a, b) => a + b.monto_total, 0);
  const pagado = desgloses.reduce((a, b) => a + b.total_pagado, 0);
  return {
    cliente_id: clienteId,
    moneda,
    total_facturado: facturado,
    total_pagado: pagado,
    pendiente: Math.max(0, facturado - pagado),
    contratos: desgloses,
  };
}

/**
 * Formatea un monto con separadores y la moneda al frente.
 */
export function formatMonto(monto: number, moneda: string = "USD"): string {
  const fmt = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(monto);
  return `${moneda} ${fmt}`;
}
