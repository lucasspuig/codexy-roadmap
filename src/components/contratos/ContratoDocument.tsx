/**
 * Documento del contrato — render server-side compatible.
 * Usa los textos legales reales del template Codexy.
 *
 * Se usa por:
 *  - /proyectos/[id]/contratos/[id]/imprimir (dark+light, optimizado para print)
 *  - /c/[token] (vista pública del cliente)
 */

import { formatDate } from "@/lib/utils";
import type { AgencySettings, Contrato } from "@/types/contratos";
import type { Cliente } from "@/types/database";

export interface ContratoDocumentProps {
  contrato: Contrato;
  cliente: Pick<Cliente, "nombre" | "empresa" | "email" | "telefono">;
  agency: AgencySettings | null;
}

const NUMBER_FMT = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtMoney(amount: number, moneda: string): string {
  return `${moneda} ${NUMBER_FMT.format(amount)}`;
}

export function ContratoDocument({
  contrato,
  cliente,
  agency,
}: ContratoDocumentProps) {
  const isImpl = contrato.tipo === "implementacion";
  const tipoLabel = isImpl ? "Implementación" : "Mantenimiento mensual";
  const fechaEmision = contrato.fecha_emision
    ? formatDate(contrato.fecha_emision)
    : formatDate(contrato.created_at);

  const clienteDisplay = cliente.empresa
    ? `${cliente.empresa} (representada por ${cliente.nombre})`
    : cliente.nombre;

  const prestadorLegal = agency?.legal_name ?? "Codexy";

  return (
    <article className="contrato-doc text-[var(--cd-text)]">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="contrato-header">
        <div className="contrato-brand">
          <div className="contrato-brand-mark">
            <span className="contrato-brand-x">X</span>
          </div>
          <div>
            <div className="contrato-brand-name">CODEXY</div>
            <div className="contrato-brand-sub">Sistemas inteligentes</div>
          </div>
        </div>
        <div className="contrato-meta">
          <div className="contrato-meta-row">
            <span className="contrato-meta-label">Contrato</span>
            <span className="contrato-meta-value contrato-mono">
              {contrato.numero}
            </span>
          </div>
          <div className="contrato-meta-row">
            <span className="contrato-meta-label">Fecha de emisión</span>
            <span className="contrato-meta-value">{fechaEmision}</span>
          </div>
        </div>
      </header>

      {/* ── Title ──────────────────────────────────────────────────── */}
      <div className="contrato-title-wrap">
        <h1 className="contrato-title">CONTRATO DE SERVICIOS</h1>
        <p className="contrato-subtitle">
          {tipoLabel}
          {contrato.servicio_titulo
            ? ` — ${contrato.servicio_titulo}`
            : ""}
        </p>
      </div>

      {/* ── Partes ─────────────────────────────────────────────────── */}
      <section className="contrato-section">
        <p className="contrato-paragraph">
          Entre <strong>{prestadorLegal.toUpperCase()}</strong> (en adelante,{" "}
          <strong>EL PRESTADOR</strong>) y{" "}
          <strong>{clienteDisplay}</strong> (en adelante,{" "}
          <strong>EL CLIENTE</strong>), se celebra el presente acuerdo de
          servicios bajo las siguientes condiciones:
        </p>
      </section>

      {/* ── Cláusulas ──────────────────────────────────────────────── */}
      {isImpl ? (
        <ClausulasImplementacion contrato={contrato} />
      ) : (
        <ClausulasMantenimiento contrato={contrato} />
      )}

      {/* ── Detalle de pagos ───────────────────────────────────────── */}
      {contrato.detalle_pagos && contrato.detalle_pagos.length > 0 ? (
        <section className="contrato-section">
          <h2 className="contrato-h2">Detalle de pagos</h2>
          <table className="contrato-table">
            <thead>
              <tr>
                <th className="contrato-th-left">Etapa</th>
                <th className="contrato-th-right">%</th>
                <th className="contrato-th-right">Monto</th>
                <th className="contrato-th-left">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {contrato.detalle_pagos.map((d, i) => (
                <tr key={i}>
                  <td>{d.etapa}</td>
                  <td className="contrato-td-right">
                    {typeof d.porcentaje === "number" ? `${d.porcentaje}%` : "—"}
                  </td>
                  <td className="contrato-td-right contrato-mono">
                    {typeof d.monto === "number"
                      ? fmtMoney(d.monto, contrato.moneda)
                      : "—"}
                  </td>
                  <td className="contrato-td-soft">{d.descripcion ?? "—"}</td>
                </tr>
              ))}
              <tr className="contrato-tr-total">
                <td colSpan={2} className="contrato-td-total">
                  Total
                </td>
                <td className="contrato-td-right contrato-mono contrato-td-total">
                  {fmtMoney(contrato.monto_total, contrato.moneda)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── Plazo (sólo implementación) ────────────────────────────── */}
      {isImpl && contrato.plazo_implementacion ? (
        <section className="contrato-section contrato-info-box">
          <span className="contrato-info-label">Plazo estimado</span>
          <span className="contrato-info-value">
            {contrato.plazo_implementacion}
          </span>
        </section>
      ) : null}

      {/* ── Firmas ─────────────────────────────────────────────────── */}
      <FirmasBlock contrato={contrato} cliente={cliente} agency={agency} />

      {/* ── Footer (numeración por print CSS) ───────────────────────── */}
      <footer className="contrato-footer">
        Codexy · {prestadorLegal} · Contrato {contrato.numero}
      </footer>
    </article>
  );
}

// ─── Cláusulas Implementación ────────────────────────────────────────────────

function ClausulasImplementacion({ contrato }: { contrato: Contrato }) {
  const items = contrato.alcance_items ?? [];
  const moneda = contrato.moneda;
  const isUSD = moneda === "USD";

  // Cláusula 6 — detalle de pagos legible
  const pagosTexto = (contrato.detalle_pagos ?? [])
    .map((d) => {
      const porc =
        typeof d.porcentaje === "number" ? ` (${d.porcentaje}%)` : "";
      const monto =
        typeof d.monto === "number"
          ? ` por ${fmtMoney(d.monto, moneda)}`
          : "";
      return `${d.etapa}${porc}${monto}`;
    })
    .join("; ");

  // Cláusula 7 — texto de mantenimiento
  const mensual = contrato.mantenimiento_mensual;
  const mora = contrato.mora_porcentaje ?? 10;
  const dias = contrato.dias_gracia ?? 5;
  const tieneMantenimiento =
    typeof mensual === "number" && mensual > 0;

  return (
    <section className="contrato-section">
      <h2 className="contrato-h2">Cláusulas</h2>
      <ol className="contrato-clauses">
        <li>
          <strong>Objeto.</strong> La presente propuesta incluye la
          implementación de sistemas de automatización personalizados, según lo
          detallado en el presupuesto aprobado. El servicio tiene como
          finalidad optimizar la operación, automatizar procesos internos y
          estructurar un embudo digital funcional.
        </li>
        <li>
          <strong>Alcance del Servicio.</strong> El servicio contempla:
          {items.length === 0 ? (
            <span> los puntos detallados en el presupuesto.</span>
          ) : (
            <ul className="contrato-sublist">
              {items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
          {contrato.alcance_excluye && contrato.alcance_excluye.length > 0 ? (
            <>
              <span className="contrato-not-includes">
                Quedan expresamente excluidos:
              </span>
              <ul className="contrato-sublist contrato-sublist-excl">
                {contrato.alcance_excluye.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </>
          ) : null}
          El mantenimiento mensual incluye soporte técnico y ajustes menores.
          Nuevas funcionalidades, integraciones adicionales o ampliaciones de
          alcance serán cotizadas de manera independiente.
        </li>
        <li>
          <strong>Información y Accesos.</strong> El cliente se compromete a
          entregar en tiempo y forma información, prioridades, protocolos y
          credenciales necesarias para integraciones. La falta de entrega puede
          retrasar la implementación.
        </li>
        <li>
          <strong>Pruebas y Ajustes.</strong> Se realizará una etapa de pruebas
          técnicas. El cliente deberá testear y reportar errores. Se realizarán
          correcciones dentro del alcance acordado.
        </li>
        <li>
          <strong>Soporte.</strong> Codexy brindará atención de lunes a viernes
          de 08:00 a 20:00 hs (horario Argentina), excluyendo feriados.
          Comunicaciones fuera de horario serán respondidas el siguiente día
          hábil.
        </li>
        <li>
          <strong>Pagos.</strong>{" "}
          {pagosTexto
            ? `${pagosTexto}.`
            : `Total ${fmtMoney(contrato.monto_total, moneda)}.`}{" "}
          Los valores expresados en {moneda}.
          {isUSD ? (
            <>
              {" "}
              En caso de abonarse en pesos argentinos, se calcularán al tipo
              de cambio oficial (BNA) vigente al día del pago.
            </>
          ) : null}{" "}
          Los precios no incluyen impuestos locales (IVA).
          {contrato.plazo_implementacion ? (
            <>
              {" "}
              Plazo estimado de implementación:{" "}
              <strong>{contrato.plazo_implementacion}</strong>.
            </>
          ) : null}
        </li>
        <li>
          <strong>Mantenimiento Futuro.</strong>{" "}
          {tieneMantenimiento ? (
            <>
              {fmtMoney(mensual!, moneda)} mensual, día 1 de cada mes; mora{" "}
              {mora}% acumulativo después de {dias} días.{" "}
            </>
          ) : (
            "El mantenimiento mensual será definido al finalizar la implementación. "
          )}
          Incluye correcciones menores y soporte técnico básico. No incluye
          nuevas funcionalidades, cambios estructurales, integraciones
          adicionales ni ampliación de alcance.
        </li>
        <li>
          <strong>Costos de Plataformas Externas.</strong> El sistema puede
          utilizar Meta (Facebook/Instagram). Costo aprox USD 0,07 por
          conversación, abonado directamente por el cliente desde su cuenta de
          Meta Business. Codexy brinda asesoramiento pero no es responsable
          por cargos de terceros.
        </li>
        <li>
          <strong>Responsabilidades.</strong> Codexy no es responsable por
          interrupciones de servicios de terceros, caídas de servidores
          externos, problemas de conectividad o cambios en políticas externas.
          La responsabilidad se limita al correcto funcionamiento del sistema
          según lo acordado. El cliente es responsable de proveer información
          veraz, mantener cuentas activas, cumplir con los pagos y colaborar
          en pruebas.
        </li>
        <li>
          <strong>Confidencialidad.</strong> Ambas partes se comprometen a
          proteger la información sensible y estratégica intercambiada en el
          marco del presente acuerdo.
        </li>
        <li>
          <strong>Vigencia.</strong> El acuerdo estará vigente mientras el
          cliente utilice el sistema y mantenga los pagos al día.
        </li>
        <li>
          <strong>Aceptación.</strong> La firma del presente documento implica
          la aceptación total de las condiciones aquí establecidas.
        </li>
      </ol>
    </section>
  );
}

// ─── Cláusulas Mantenimiento ─────────────────────────────────────────────────

function ClausulasMantenimiento({ contrato }: { contrato: Contrato }) {
  const items = contrato.alcance_items ?? [];
  const excluye = contrato.alcance_excluye ?? [];
  const moneda = contrato.moneda;
  const mensual = contrato.mantenimiento_mensual ?? contrato.monto_total;
  const mora = contrato.mora_porcentaje ?? 10;
  const dias = contrato.dias_gracia ?? 5;

  return (
    <section className="contrato-section">
      <h2 className="contrato-h2">Cláusulas</h2>
      <ol className="contrato-clauses">
        <li>
          <strong>Objeto.</strong> Este acuerdo establece las condiciones del
          servicio de mantenimiento y soporte brindado por Codexy, posterior a
          la entrega del sistema desarrollado, ya abonado y finalizado.
        </li>
        <li>
          <strong>Alcance.</strong>
          <span> Incluye:</span>
          {items.length === 0 ? (
            <span> los puntos definidos para el mantenimiento mensual.</span>
          ) : (
            <ul className="contrato-sublist">
              {items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
          {excluye.length > 0 ? (
            <>
              <span className="contrato-not-includes">NO incluye:</span>
              <ul className="contrato-sublist contrato-sublist-excl">
                {excluye.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </>
          ) : null}
        </li>
        <li>
          <strong>Soporte.</strong> Lunes a viernes 08:00 a 20:00 hs
          (Argentina), excluyendo feriados. Consultas fuera de horario
          respondidas el siguiente día hábil.
        </li>
        <li>
          <strong>Pagos.</strong> Monto mensual fijo:{" "}
          <strong>{fmtMoney(mensual, moneda)}</strong>. Día 1 de cada mes.
          Plazo de gracia: {dias} días. Vencido el plazo: suspensión + recargo{" "}
          {mora}% mensual acumulativo.
        </li>
        <li>
          <strong>Limitaciones.</strong> Codexy no responde por: caídas de
          terceros (WhatsApp, Tienda Nube, servidores, APIs, plataformas de
          pago), cambios en políticas/costos de dichos servicios, ni
          resultados comerciales (ventas, conversiones, posicionamiento).
        </li>
        <li>
          <strong>Compromisos.</strong> Codexy brindará soporte y soluciones,
          informará si el problema viene de terceros, resolverá lo que esté
          dentro del alcance.
        </li>
        <li>
          <strong>Responsabilidad del Cliente.</strong> Facilitar información
          para soporte, mantener pago al día. Inconvenientes originados por
          acciones del cliente o terceros (cambios externos, configuraciones
          propias) quedan fuera de la responsabilidad de Codexy y se cotizan
          aparte.
        </li>
        <li>
          <strong>Confidencialidad y Vigencia.</strong> Confidencialidad mutua
          durante y después del vínculo. Contrato vigente desde la entrega del
          sistema mientras se mantenga el servicio activo.
        </li>
      </ol>
    </section>
  );
}

// ─── Bloque firmas ───────────────────────────────────────────────────────────

function FirmasBlock({
  contrato,
  cliente,
  agency,
}: {
  contrato: Contrato;
  cliente: Pick<Cliente, "nombre" | "empresa">;
  agency: AgencySettings | null;
}) {
  const prestadorNombre = agency?.signatory_name ?? "Lucas Puig";
  const prestadorRole = agency?.signatory_role ?? "CEO";
  const prestadorLegal = agency?.legal_name ?? "Codexy";
  const fechaPrestador = contrato.fecha_firma_prestador
    ? formatDate(contrato.fecha_firma_prestador)
    : null;
  const fechaCliente = contrato.fecha_firma_cliente
    ? formatDate(contrato.fecha_firma_cliente)
    : null;

  return (
    <section className="contrato-section contrato-firmas-section">
      <h2 className="contrato-h2">Firmas</h2>
      <div className="contrato-firmas-grid">
        {/* EL PRESTADOR */}
        <div className="contrato-firma-block">
          <div className="contrato-firma-rol">EL PRESTADOR</div>
          <div className="contrato-firma-img">
            {contrato.firma_prestador_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contrato.firma_prestador_url}
                alt={`Firma de ${prestadorNombre}`}
              />
            ) : (
              <div className="contrato-firma-pending">Pendiente de firma</div>
            )}
          </div>
          <div className="contrato-firma-line" />
          <div className="contrato-firma-name">{prestadorNombre}</div>
          <div className="contrato-firma-role">
            {prestadorRole} · {prestadorLegal}
          </div>
          {fechaPrestador ? (
            <div className="contrato-firma-fecha">Firmado el {fechaPrestador}</div>
          ) : null}
        </div>

        {/* EL CLIENTE */}
        <div className="contrato-firma-block">
          <div className="contrato-firma-rol">EL CLIENTE</div>
          <div className="contrato-firma-img">
            {contrato.firma_cliente_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contrato.firma_cliente_url}
                alt={`Firma de ${cliente.nombre}`}
              />
            ) : (
              <div className="contrato-firma-pending">Pendiente de firma</div>
            )}
          </div>
          <div className="contrato-firma-line" />
          <div className="contrato-firma-name">{cliente.nombre}</div>
          {cliente.empresa ? (
            <div className="contrato-firma-role">{cliente.empresa}</div>
          ) : null}
          {fechaCliente ? (
            <div className="contrato-firma-fecha">Firmado el {fechaCliente}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
