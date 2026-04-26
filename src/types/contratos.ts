// Tipos para el módulo de contratos digitales con e-signature.

export type ContratoTipo = "implementacion" | "mantenimiento";
export type ContratoEstado =
  | "borrador"
  | "enviado"
  | "firmado_cliente"
  | "firmado_completo"
  | "cancelado";
export type ContratoModalidad = "unico" | "50_50" | "mensual" | "custom";

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
  "Soporte técnico básico",
  "Ajustes menores relacionados con el funcionamiento del sistema entregado",
  "Asistencia sobre el uso y operación general de las herramientas configuradas",
];

export const ALCANCE_MANTENIMIENTO_EXCLUYE: string[] = [
  "Campañas publicitarias, estrategias de marketing o generación de ventas",
  "Nuevos desarrollos, rediseños, funcionalidades adicionales o integraciones externas",
];
