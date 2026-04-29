// Generador de cuotas mensuales y cálculo de fechas del ciclo.
//
// Ciclo de cobranza por defecto:
//   - Día 3 del mes  → recordatorio inicial
//   - Día 6 del mes  → segundo aviso (si no pagó)
//   - Día 9 del mes  → último día del rango (vencimiento)
//   - Día 10 del mes → escalación al CEO

import type { Contrato } from "@/types/contratos";

export interface CicloFechas {
  /** Fecha del recordatorio inicial (día 3 default) */
  recordatorio_1: string;
  /** Fecha del segundo aviso (día 6 default) */
  recordatorio_2: string;
  /** Último día del rango de pago (día 9 default) */
  vencimiento: string;
  /** Día de escalación al admin (día 10 default) */
  escalacion: string;
}

/** Días por defecto del ciclo. Configurables a futuro vía agency_payment_data. */
export const DIAS_DEFAULT = {
  recordatorio_1: 3,
  recordatorio_2: 6,
  vencimiento: 9,
  escalacion: 10,
} as const;

/** Format YYYY-MM-DD para una Date local-tz. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** "YYYY-MM" del período (mes calendario en zona local). */
export function periodoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Calcula las 4 fechas del ciclo para un período "YYYY-MM" dado. */
export function fechasDelCiclo(
  periodo: string,
  dias = DIAS_DEFAULT,
): CicloFechas {
  const [yStr, mStr] = periodo.split("-");
  const y = Number(yStr);
  const m = Number(mStr) - 1; // 0-indexed
  const at = (d: number) => ymd(new Date(y, m, d));
  return {
    recordatorio_1: at(dias.recordatorio_1),
    recordatorio_2: at(dias.recordatorio_2),
    vencimiento: at(dias.vencimiento),
    escalacion: at(dias.escalacion),
  };
}

/** Avanza N períodos a partir de uno dado. */
export function siguientePeriodo(periodo: string, n = 1): string {
  const [yStr, mStr] = periodo.split("-");
  let y = Number(yStr);
  let m = Number(mStr) - 1 + n;
  while (m >= 12) {
    m -= 12;
    y += 1;
  }
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export interface CuotaPlan {
  contrato_id: string;
  cliente_id: string;
  periodo: string;
  fecha_recordatorio_1: string;
  fecha_recordatorio_2: string;
  fecha_vencimiento: string;
  fecha_escalacion: string;
  monto_usd: number;
  es_trimestral: boolean;
  meses_cubiertos: number;
}

/**
 * Plan de cuotas para los próximos N meses a partir de una fecha de inicio.
 * Si plan_periodicidad es "trimestral", se generan cuotas cada 3 meses con
 * descuento aplicado, cada una representando 3 meses.
 */
export function planDeCuotas(
  contrato: Pick<
    Contrato,
    | "id"
    | "cliente_id"
    | "mantenimiento_mensual"
    | "fecha_firmado_completo"
    | "fecha_emision"
    | "modalidad_pago"
    | "tipo"
  > & {
    plan_periodicidad?: "mensual" | "trimestral";
    plan_descuento_pct?: number;
  },
  meses: number = 12,
): CuotaPlan[] {
  const cuotaMensual = Number(contrato.mantenimiento_mensual ?? 0);
  if (cuotaMensual <= 0) return [];

  // Período de inicio = el mes SIGUIENTE al de la firma (o emisión).
  const inicio =
    contrato.fecha_firmado_completo ?? contrato.fecha_emision ?? null;
  if (!inicio) return [];
  const startDate = new Date(inicio);
  if (Number.isNaN(startDate.getTime())) return [];
  // Avanzar al próximo mes
  startDate.setMonth(startDate.getMonth() + 1);
  const periodoInicial = periodoOf(startDate);

  const trimestral = contrato.plan_periodicidad === "trimestral";
  const descuento = Number(contrato.plan_descuento_pct ?? 0) / 100;

  const out: CuotaPlan[] = [];
  if (trimestral) {
    // 1 cuota cada 3 meses, monto = (cuota_mensual * 3) * (1 - descuento)
    const totalTrimestral = cuotaMensual * 3 * (1 - descuento);
    const ciclos = Math.ceil(meses / 3);
    for (let i = 0; i < ciclos; i++) {
      const periodo = siguientePeriodo(periodoInicial, i * 3);
      const fechas = fechasDelCiclo(periodo);
      out.push({
        contrato_id: contrato.id,
        cliente_id: contrato.cliente_id,
        periodo,
        fecha_recordatorio_1: fechas.recordatorio_1,
        fecha_recordatorio_2: fechas.recordatorio_2,
        fecha_vencimiento: fechas.vencimiento,
        fecha_escalacion: fechas.escalacion,
        monto_usd: round2(totalTrimestral),
        es_trimestral: true,
        meses_cubiertos: 3,
      });
    }
  } else {
    for (let i = 0; i < meses; i++) {
      const periodo = siguientePeriodo(periodoInicial, i);
      const fechas = fechasDelCiclo(periodo);
      out.push({
        contrato_id: contrato.id,
        cliente_id: contrato.cliente_id,
        periodo,
        fecha_recordatorio_1: fechas.recordatorio_1,
        fecha_recordatorio_2: fechas.recordatorio_2,
        fecha_vencimiento: fechas.vencimiento,
        fecha_escalacion: fechas.escalacion,
        monto_usd: round2(cuotaMensual),
        es_trimestral: false,
        meses_cubiertos: 1,
      });
    }
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Formatea un monto USD para mostrar. */
export function formatUSD(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formatea un monto ARS sin decimales. */
export function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

/** "9 abr 2026" para mostrar en mensajes. */
export function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "09/04" para mostrar en mensajes (formato corto). */
export function formatFechaDDMM(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}
