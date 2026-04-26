// Tipos para el módulo de contratos digitales con e-signature.

export type ContratoTipo =
  | "implementacion"
  | "mantenimiento"
  | "implementacion_y_mantenimiento";

export type ContratoEstado =
  | "borrador"
  | "enviado"
  | "firmado_cliente"
  | "firmado_completo"
  | "cancelado";

export type ContratoModalidad =
  | "unico"
  | "50_50"
  | "mensual"
  | "unico_mas_mensual"
  | "custom";

export interface ContratoPagoDetalle {
  etapa: string; // "Inicio del proyecto" | "Entrega final" | "Mes 1" | etc.
  porcentaje?: number; // 0-100
  monto?: number;
  descripcion?: string;
}

export interface Contrato {
  id: string;
  numero: string;
  cliente_id: string;
  proyecto_id: string | null;
  tipo: ContratoTipo;
  estado: ContratoEstado;

  servicio_titulo: string;
  servicio_descripcion: string | null;
  alcance_items: string[];
  alcance_excluye: string[];
  plazo_implementacion: string | null;

  monto_total: number;
  moneda: string;
  modalidad_pago: ContratoModalidad;
  detalle_pagos: ContratoPagoDetalle[];
  mantenimiento_mensual: number | null;
  mora_porcentaje: number | null;
  dias_gracia: number | null;

  fecha_emision: string | null;
  fecha_envio_cliente: string | null;
  fecha_firma_cliente: string | null;
  fecha_firma_prestador: string | null;
  fecha_firmado_completo: string | null;

  firma_cliente_url: string | null;
  firma_prestador_url: string | null;
  firma_cliente_ip: string | null;
  firma_cliente_ua: string | null;

  token_publico: string | null;
  notas_internas: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencySettings {
  id: 1;
  legal_name: string;
  signature_url: string | null;
  signatory_name: string | null;
  signatory_role: string | null;
  contact_email: string | null;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Helpers de display para el tipo de contrato.
 */
export const TIPO_LABELS: Record<ContratoTipo, string> = {
  implementacion: "Implementación",
  mantenimiento: "Mantenimiento",
  implementacion_y_mantenimiento: "Implementación + Mantenimiento",
};

export const TIPO_LABELS_LARGOS: Record<ContratoTipo, string> = {
  implementacion: "Implementación",
  mantenimiento: "Mantenimiento mensual",
  implementacion_y_mantenimiento:
    "Implementación + Mantenimiento mensual",
};

/**
 * Indica si la modalidad/tipo implica una cuota mensual recurrente.
 */
export function tieneMantenimiento(
  tipo: ContratoTipo,
  modalidad: ContratoModalidad,
): boolean {
  return (
    tipo === "mantenimiento" ||
    tipo === "implementacion_y_mantenimiento" ||
    modalidad === "mensual" ||
    modalidad === "unico_mas_mensual"
  );
}

/**
 * Indica si el contrato incluye una etapa de implementación (pago "upfront").
 */
export function tieneImplementacion(tipo: ContratoTipo): boolean {
  return tipo === "implementacion" || tipo === "implementacion_y_mantenimiento";
}

/**
 * Defaults por tipo de contrato — se prellenan en el wizard.
 * Basados en los contratos firmados de Codexy.
 */
export const ALCANCE_IMPLEMENTACION_DEFAULT: string[] = [
  "Desarrollo, configuración e implementación del sistema de automatización",
  "Integración con canales de comunicación (WhatsApp, Instagram u otros acordados)",
  "Configuración de agenda online con visualización de horarios disponibles",
  "Automatizaciones de seguimiento pre consulta (24 hs antes)",
  "Automatización de seguimiento post consulta (reseñas y fidelización)",
  "Automatización de recuperación de pacientes inactivos",
  "Dashboard y panel de estadísticas",
];

export const ALCANCE_IMPLEMENTACION_EXCLUYE: string[] = [
  "Nuevas funcionalidades fuera del alcance acordado",
  "Cambios estructurales posteriores",
  "Integraciones adicionales no presupuestadas",
  "Campañas publicitarias o estrategias de marketing",
];

export const ALCANCE_MANTENIMIENTO_DEFAULT: string[] = [
  "Soporte técnico en horarios predeterminados (lunes a viernes 08:00–20:00 hs Argentina)",
  "Hosting y mantenimiento del servidor asociado al sistema",
  "Consumo de tokens de IA necesarios para la operación normal del sistema",
  "Monitoreo de las integraciones (WhatsApp, agenda, automatizaciones) y resolución de errores",
  "Ajustes menores y asistencia sobre el uso y operación del sistema",
];

export const ALCANCE_MANTENIMIENTO_EXCLUYE: string[] = [
  "Nuevas funcionalidades, rediseños o desarrollos adicionales",
  "Integraciones externas no incluidas en la implementación original",
  "Campañas publicitarias o estrategias de marketing",
  "Cambios estructurales que requieran un nuevo desarrollo",
];

/**
 * Para el contrato combinado (implementación + mantenimiento posterior),
 * el alcance se construye uniendo ambos sets — la implementación detalla
 * el desarrollo inicial y el mantenimiento detalla qué cubre la mensualidad.
 */
export const ALCANCE_COMBO_DEFAULT: string[] = [
  ...ALCANCE_IMPLEMENTACION_DEFAULT,
];

export const ALCANCE_COMBO_EXCLUYE: string[] = [
  ...ALCANCE_IMPLEMENTACION_EXCLUYE,
];
