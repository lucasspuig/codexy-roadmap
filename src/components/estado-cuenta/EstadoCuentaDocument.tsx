/**
 * Documento "Estado de Cuenta" — formato profesional para enviar al cliente
 * (descargable como PDF vía window.print()).
 *
 * Estructura inspirada en la referencia Codexy R3:
 *   1. Header con título centrado + branding
 *   2. Bloque cliente / documento N° / fecha
 *   3. Saludo personalizado
 *   4. Sección 1 — Saldos únicos pendientes (upfront)
 *   5. Sección 2 — Cuota de mantenimiento mensual
 *   6. Sección 3 — Cronograma de pagos
 *   7. Resumen ejecutivo
 *   8. Footer
 *
 * Paleta: usa el brand de Codexy (violeta) para headers/totales, verde para
 * "completado" y un tinte sutil para boxes informativos.
 */

import { facturadoDeContrato } from "@/lib/saldos";
import type { Contrato } from "@/types/contratos";
import type { Pago } from "@/types/pagos";
import type { Cliente } from "@/types/database";

export interface EstadoCuentaDocumentProps {
  cliente: Pick<Cliente, "id" | "nombre" | "empresa" | "rubro">;
  contratos: Contrato[];
  pagos: Pago[];
  /** Fecha de emisión del documento (default: hoy) */
  fecha?: Date;
  /** Subtítulo opcional (ej: "Plataforma de gestión odontológica con IA"). */
  subtitulo?: string;
  /** Sufijo de revisión opcional (ej: "R2", "R3"). */
  revision?: string;
}

const NUMBER_FMT = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtUSD(n: number): string {
  return `$ ${NUMBER_FMT.format(n)}`;
}

function fmtFecha(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtMes(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

/** Genera un nro de documento estable: EC-YYYYMMDD-XXXX (XXXX = first 4 del cliente_id). */
function generarNumeroDoc(clienteId: string, fecha: Date, revision?: string): string {
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  const tail = clienteId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const rev = revision ? `-${revision}` : "";
  return `EC-${yyyy}${mm}${dd}-${tail}${rev}`;
}

export function EstadoCuentaDocument({
  cliente,
  contratos,
  pagos,
  fecha,
  subtitulo,
  revision,
}: EstadoCuentaDocumentProps) {
  const today = fecha ?? new Date();
  const docNumero = generarNumeroDoc(cliente.id, today, revision);

  // ─── Cálculos ──────────────────────────────────────────────
  // Filtramos contratos visibles (no borrador / no cancelado).
  const contratosVivos = contratos.filter(
    (c) => c.estado !== "borrador" && c.estado !== "cancelado",
  );

  const moneda = contratosVivos[0]?.moneda ?? "USD";
  const isUSD = moneda === "USD";

  // Pendientes upfront (implementación): solo contratos con monto_total > 0
  // y modalidad NO mensual pura (porque "mensual" no tiene componente upfront).
  const contratosUpfront = contratosVivos.filter(
    (c) => c.modalidad_pago !== "mensual" && c.monto_total > 0,
  );

  // Cuotas mensuales activas
  const contratosMensuales = contratosVivos.filter(
    (c) =>
      typeof c.mantenimiento_mensual === "number" &&
      c.mantenimiento_mensual > 0,
  );

  // Totales facturados (usando el helper, que acumula mensualidades)
  const totalFacturadoSinMensual = contratosUpfront.reduce(
    (a, c) => a + c.monto_total,
    0,
  );
  const totalFacturadoFull = contratosVivos.reduce(
    (a, c) => a + facturadoDeContrato(c, today),
    0,
  );
  const totalPagado = pagos.reduce((a, p) => a + Number(p.monto || 0), 0);

  // Pendiente upfront = max(0, totalUpfront - pagosImputables)
  // Para simplicidad, asumimos que los pagos primero saldan upfront.
  const pendienteUpfront = Math.max(
    0,
    totalFacturadoSinMensual -
      pagos
        .filter((p) =>
          contratosUpfront.some((c) => c.id === p.contrato_id),
        )
        .reduce((a, p) => a + Number(p.monto || 0), 0),
  );

  const totalMensual = contratosMensuales.reduce(
    (a, c) => a + (c.mantenimiento_mensual ?? 0),
    0,
  );

  const pendienteTotal = Math.max(0, totalFacturadoFull - totalPagado);
  const alDia = pendienteTotal <= 0.005;

  // ─── Cronograma (heurístico, según datos disponibles) ──────
  // Si hay implementación pendiente: "Al lanzamiento del sistema"
  // Si hay cuota mensual: "Inicio cuota mensual: mes siguiente"
  const proximoMes = (() => {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return d;
  })();

  const desarrolloCompleto = pendienteUpfront <= 0.005 && contratosUpfront.length > 0;

  return (
    <article className="estado-cuenta-doc">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="ec-header">
        <div className="ec-brand" aria-label="Codexy">
          <div className="ec-brand-mark">
            <svg
              viewBox="0 0 100 100"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 10 L28 10 Q32 10 35 14 L50 36 Q52 39 52 42 L52 58 Q52 61 50 64 L35 86 Q32 90 28 90 L12 90 Q8 90 10 86 L30 54 Q33 50 30 46 L10 14 Q8 10 12 10 Z" />
              <path d="M88 10 L72 10 Q68 10 65 14 L50 36 Q48 39 48 42 L48 58 Q48 61 50 64 L65 86 Q68 90 72 90 L88 90 Q92 90 90 86 L70 54 Q67 50 70 46 L90 14 Q92 10 88 10 Z" />
            </svg>
          </div>
          <span className="ec-brand-name">CODEXY</span>
        </div>
        <h1 className="ec-title">ESTADO DE CUENTA ACTUALIZADO</h1>
        <p className="ec-subtitle">
          {subtitulo ??
            (cliente.rubro
              ? `Plataforma de automatización · ${cliente.rubro}`
              : "Plataforma de automatización personalizada")}
        </p>
      </header>

      {/* ── Cliente / Documento info ──────────────────────── */}
      <div className="ec-info-row">
        <div className="ec-info-col">
          <div className="ec-info-label">CLIENTE</div>
          <div className="ec-info-value">{cliente.nombre}</div>
          {cliente.empresa ? (
            <div className="ec-info-sub">{cliente.empresa}</div>
          ) : null}
        </div>
        <div className="ec-info-col ec-info-col--right">
          <div className="ec-info-label">DOCUMENTO N°</div>
          <div className="ec-info-value ec-mono">{docNumero}</div>
          <div className="ec-info-sub">Fecha: {fmtFecha(today)}</div>
        </div>
      </div>

      {/* ── Saludo ─────────────────────────────────────────── */}
      <div className="ec-greeting">
        <strong>
          {greetingFor(cliente.nombre)},
        </strong>
        <p>
          Le enviamos el estado de cuenta actualizado con el detalle del
          {pendienteUpfront > 0 ? " saldo pendiente, " : " estado de pagos, "}
          las condiciones de pago vinculadas a la entrega de su plataforma y el
          cronograma de su cuota mensual.
        </p>
      </div>

      {/* ── Sección 1: Saldo único pendiente ──────────────── */}
      {contratosUpfront.length > 0 ? (
        <section className="ec-section">
          <h2 className="ec-section-title">
            1. SALDO ÚNICO PENDIENTE — PAGO POR DESARROLLO
          </h2>

          {desarrolloCompleto ? (
            <div className="ec-banner ec-banner--ok">
              <span className="ec-banner-mark">✦</span>
              <strong>El desarrollo de la plataforma está al día.</strong>
            </div>
          ) : (
            <div className="ec-banner ec-banner--info">
              <span className="ec-banner-mark">✦</span>
              <span>
                {pendienteUpfront > 0 ? (
                  <>
                    Saldo pendiente de implementación:{" "}
                    <strong>{fmtUSD(pendienteUpfront)}</strong>. Será abonado
                    según las etapas acordadas en el contrato.
                  </>
                ) : (
                  <>
                    Sin saldo pendiente de implementación al{" "}
                    {fmtFecha(today)}.
                  </>
                )}
              </span>
            </div>
          )}

          <table className="ec-table">
            <thead>
              <tr>
                <th className="ec-th-left">Concepto</th>
                <th className="ec-th-left">Tipo</th>
                <th className="ec-th-right">Importe ({moneda})</th>
              </tr>
            </thead>
            <tbody>
              {contratosUpfront.map((c) => {
                const pagadoContrato = pagos
                  .filter((p) => p.contrato_id === c.id)
                  .reduce((a, p) => a + Number(p.monto || 0), 0);
                const pendienteContrato = Math.max(0, c.monto_total - pagadoContrato);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="ec-concepto-titulo">
                        {c.servicio_titulo}
                      </div>
                      {c.servicio_descripcion ? (
                        <div className="ec-concepto-desc">
                          {c.servicio_descripcion}
                        </div>
                      ) : null}
                      <div className="ec-concepto-meta ec-mono">
                        {c.numero}
                      </div>
                    </td>
                    <td>{tipoLabelUpfront(c)}</td>
                    <td className="ec-td-right ec-mono ec-monto">
                      <div>{fmtUSD(c.monto_total)}</div>
                      {pagadoContrato > 0 ? (
                        <div className="ec-monto-sub">
                          Pagado {fmtUSD(pagadoContrato)} · Pendiente{" "}
                          {fmtUSD(pendienteContrato)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              <tr className="ec-row-total">
                <td colSpan={2} className="ec-td-total">
                  TOTAL PENDIENTE DE IMPLEMENTACIÓN
                </td>
                <td className="ec-td-right ec-mono ec-td-total">
                  {fmtUSD(pendienteUpfront)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── Sección 2: Cuota mensual ──────────────────────── */}
      {contratosMensuales.length > 0 ? (
        <section className="ec-section">
          <h2 className="ec-section-title">
            2. CUOTA DE MANTENIMIENTO MENSUAL
          </h2>
          <table className="ec-table">
            <thead>
              <tr>
                <th className="ec-th-left">Concepto mensual</th>
                <th className="ec-th-left">Frecuencia</th>
                <th className="ec-th-right">Importe ({moneda})</th>
              </tr>
            </thead>
            <tbody>
              {contratosMensuales.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="ec-concepto-titulo">
                      {c.servicio_titulo}
                    </div>
                    <div className="ec-concepto-desc">
                      Soporte técnico (L–V 08:00–20:00 hs Argentina), hosting y
                      mantenimiento del servidor, consumo de tokens de IA y
                      ajustes menores del sistema.
                    </div>
                    <div className="ec-concepto-meta ec-mono">{c.numero}</div>
                  </td>
                  <td>Mensual</td>
                  <td className="ec-td-right ec-mono ec-monto">
                    {fmtUSD(c.mantenimiento_mensual ?? 0)}
                  </td>
                </tr>
              ))}
              <tr className="ec-row-total">
                <td colSpan={2} className="ec-td-total">
                  TOTAL CUOTA MENSUAL
                </td>
                <td className="ec-td-right ec-mono ec-td-total">
                  {fmtUSD(totalMensual)} / mes
                </td>
              </tr>
            </tbody>
          </table>
          <p className="ec-fineprint">
            La cuota podrá ser revisada cada tres (3) meses según el desempeño
            del sistema, el volumen de uso real y los costos asociados al
            servidor y al consumo de tokens de IA. Cualquier ajuste se
            informará con al menos 15 días de anticipación.
          </p>
        </section>
      ) : null}

      {/* ── Sección 3: Cronograma ─────────────────────────── */}
      {(contratosUpfront.length > 0 || contratosMensuales.length > 0) ? (
        <section className="ec-section">
          <h2 className="ec-section-title">3. CRONOGRAMA DE PAGOS</h2>
          <table className="ec-table">
            <thead>
              <tr>
                <th className="ec-th-left">Período</th>
                <th className="ec-th-left">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pendienteUpfront > 0 ? (
                <tr className="ec-row--accent-info">
                  <td>
                    <strong>{fmtMes(today)}</strong>
                    <div className="ec-row-sub">Saldo pendiente</div>
                  </td>
                  <td>
                    Pago de implementación pendiente:{" "}
                    <strong>{fmtUSD(pendienteUpfront)}</strong>. Se abona según
                    las etapas establecidas en el contrato.
                  </td>
                </tr>
              ) : contratosUpfront.length > 0 ? (
                <tr className="ec-row--accent-ok">
                  <td>
                    <strong>{fmtMes(today)}</strong>
                    <div className="ec-row-sub">Implementación al día</div>
                  </td>
                  <td>
                    Pagos de implementación cancelados. Sin saldo pendiente
                    por desarrollo.
                  </td>
                </tr>
              ) : null}
              {contratosMensuales.length > 0 ? (
                <tr className="ec-row--accent-brand">
                  <td>
                    <strong>{fmtMes(proximoMes)} en adelante</strong>
                    <div className="ec-row-sub">Cuota mensual</div>
                  </td>
                  <td>
                    Cobro mensual de {fmtUSD(totalMensual)} el día 1 de cada
                    mes calendario. Plazo de gracia: 5 días.
                  </td>
                </tr>
              ) : null}
              {contratosMensuales.length > 0 ? (
                <tr>
                  <td>
                    <strong>Cada 3 meses</strong>
                    <div className="ec-row-sub">Revisión trimestral</div>
                  </td>
                  <td>
                    Revisión del valor de la cuota según uso real, consumo de
                    tokens IA y costos de servidor. Aviso 15 días antes.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── Resumen ejecutivo ─────────────────────────────── */}
      <section className="ec-resumen">
        <h3 className="ec-resumen-title">RESUMEN EJECUTIVO</h3>
        <ul className="ec-resumen-list">
          {alDia ? (
            <li className="ec-resumen-li ec-resumen-li--ok">
              <span className="ec-resumen-mark">✦</span>
              <strong>Cuenta al día:</strong> sin saldo pendiente al{" "}
              {fmtFecha(today)}.
            </li>
          ) : (
            <li className="ec-resumen-li ec-resumen-li--warn">
              <span className="ec-resumen-mark">✦</span>
              <strong>Saldo pendiente total:</strong>{" "}
              <strong>{fmtUSD(pendienteTotal)}</strong>.
            </li>
          )}
          {pendienteUpfront > 0 ? (
            <li className="ec-resumen-li ec-resumen-li--info">
              <span className="ec-resumen-mark">✦</span>
              <strong>Saldo de implementación pendiente:</strong>{" "}
              {fmtUSD(pendienteUpfront)}.
            </li>
          ) : null}
          {totalMensual > 0 ? (
            <li className="ec-resumen-li ec-resumen-li--brand">
              <span className="ec-resumen-mark">✦</span>
              <strong>Cuota mensual:</strong> {fmtUSD(totalMensual)} / mes.
            </li>
          ) : null}
          {totalPagado > 0 ? (
            <li className="ec-resumen-li">
              <span className="ec-resumen-mark">✦</span>
              <strong>Total pagado a la fecha:</strong> {fmtUSD(totalPagado)}.
            </li>
          ) : null}
        </ul>
        <p className="ec-resumen-fine">
          Los precios están expresados en {moneda}.
          {isUSD ? (
            <>
              {" "}
              Si se abona en pesos argentinos se calculan al tipo de cambio
              oficial (BNA) vigente al día del pago.
            </>
          ) : null}{" "}
          Ante cualquier consulta, no dude en comunicarse.
        </p>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="ec-footer">
        — Documento interno de gestión de cuenta · Codexy ·{" "}
        <span className="ec-mono">{docNumero}</span> —
      </footer>
    </article>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function tipoLabelUpfront(c: Contrato): string {
  if (c.modalidad_pago === "unico") return "Pago único";
  if (c.modalidad_pago === "50_50") return "Pago en 2 etapas";
  if (c.modalidad_pago === "unico_mas_mensual") return "Pago único";
  if (c.modalidad_pago === "custom") return "Pago por etapas";
  return "Pago único";
}

function greetingFor(nombre: string): string {
  // Detecta "Dr.", "Dra.", "Lic." al inicio para mantener formalidad
  const lower = nombre.toLowerCase();
  if (lower.startsWith("dra")) return `Estimada ${nombre.split(" ").slice(0, 2).join(" ")}`;
  if (lower.startsWith("dr")) return `Estimado ${nombre.split(" ").slice(0, 2).join(" ")}`;
  // Default: "Estimad@ <primer nombre>"
  const first = nombre.split(" ")[0] || nombre;
  return `Estimad@ ${first}`;
}

