// Tipos del módulo de pagos / saldos.

import type { Contrato, ContratoModalidad, ContratoTipo } from "./contratos";

export type PagoMetodo =
  | "transferencia"
  | "efectivo"
  | "mercadopago"
  | "tarjeta"
  | "cripto"
  | "otro";

export interface Pago {
  id: string;
  contrato_id: string;
  cliente_id: string;
  fecha_pago: string; // ISO date
  monto: number;
  moneda: string;
  metodo: PagoMetodo | null;
  etapa: string | null;
  comprobante_url: string | null;
  notas: string | null;
  visible_cliente: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Resumen de un contrato individual con sus pagos.
 */
export interface ContratoSaldo {
  contrato_id: string;
  numero: string;
  tipo: ContratoTipo;
  modalidad_pago: ContratoModalidad;
  servicio_titulo: string;
  monto_total: number;
  mantenimiento_mensual: number | null;
  moneda: string;
  total_pagado: number;
  pendiente: number;
  pagos: Pago[];
}

/**
 * Resumen agregado para un cliente.
 */
export interface SaldoCliente {
  cliente_id: string;
  moneda: string;
  total_facturado: number;
  total_pagado: number;
  pendiente: number;
  contratos: ContratoSaldo[];
}

/**
 * Payload del RPC público (vista cliente).
 */
export interface PublicSaldosPayload {
  cliente_id: string;
  proyecto_id: string;
  moneda: string;
  total_facturado: number;
  total_pagado: number;
  pendiente: number;
  contratos: Array<
    Pick<
      Contrato,
      | "id"
      | "numero"
      | "tipo"
      | "estado"
      | "servicio_titulo"
      | "monto_total"
      | "moneda"
      | "modalidad_pago"
      | "mantenimiento_mensual"
      | "fecha_emision"
      | "fecha_firmado_completo"
      | "token_publico"
      | "detalle_pagos"
    >
  >;
  pagos: Array<
    Pick<
      Pago,
      | "id"
      | "contrato_id"
      | "fecha_pago"
      | "monto"
      | "moneda"
      | "metodo"
      | "etapa"
      | "notas"
    >
  >;
}

export const PAGO_METODO_LABELS: Record<PagoMetodo, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  tarjeta: "Tarjeta",
  cripto: "Cripto",
  otro: "Otro",
};
