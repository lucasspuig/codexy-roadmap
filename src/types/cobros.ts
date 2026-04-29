// Tipos del módulo de cobros mensuales.

export type CuotaEstado =
  | "pendiente"
  | "recordada_1"
  | "recordada_2"
  | "pagada"
  | "escalada"
  | "cancelada";

export interface CuotaMensual {
  id: string;
  contrato_id: string;
  cliente_id: string;
  periodo: string; // 'YYYY-MM'
  fecha_recordatorio_1: string;
  fecha_recordatorio_2: string;
  fecha_vencimiento: string;
  fecha_escalacion: string;
  monto_usd: number;
  estado: CuotaEstado;
  es_trimestral: boolean;
  meses_cubiertos: number;
  pago_id: string | null;
  pagada_at: string | null;
  escalada_at: string | null;
  recordatorio_1_enviado_at: string | null;
  recordatorio_2_enviado_at: string | null;
  escalacion_enviada_at: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type MensajeCategoria =
  | "comprobante_pago"
  | "consulta_cliente"
  | "postulante"
  | "desconocido";

export interface MensajeRecibido {
  id: string;
  telefono: string;
  cliente_id: string | null;
  cuerpo: string | null;
  tiene_adjunto: boolean;
  adjunto_url: string | null;
  adjunto_tipo: string | null;
  adjunto_nombre: string | null;
  categoria: MensajeCategoria;
  procesado_at: string | null;
  procesado_accion: string | null;
  requiere_atencion: boolean;
  created_at: string;
}

export interface AgencyPaymentData {
  id: 1;
  banco: string;
  cbu_pesos: string | null;
  alias_pesos: string | null;
  cvu_usd: string | null;
  alias_usd: string | null;
  cuil: string | null;
  numero_escalacion: string | null;
  mercadopago_activo: boolean;
  mercadopago_access_token: string | null;
  updated_at: string;
}

export interface MensajeTemplate {
  id: string;
  nombre: string;
  descripcion: string | null;
  cuerpo: string;
  activo: boolean;
  updated_at: string;
}

export type PlanPeriodicidad = "mensual" | "trimestral";

export interface MensajeEnviado {
  id: string;
  cliente_id: string | null;
  cuota_id: string | null;
  template_id: string | null;
  telefono_destino: string;
  cuerpo: string;
  estado: "enviado" | "fallido" | "leido";
  error: string | null;
  created_at: string;
}
