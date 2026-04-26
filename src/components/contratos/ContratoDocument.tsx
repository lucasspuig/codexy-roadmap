/**
 * Documento del contrato — render server-side compatible.
 * Usa los textos legales reales del template Codexy.
 *
 * Se usa por:
 *  - /proyectos/[id]/contratos/[id]/imprimir (dark+light, optimizado para print)
 *  - /c/[token] (vista pública del cliente)
 */

import { formatDate } from "@/lib/utils";
import {
  TIPO_LABELS_LARGOS,
  type AgencySettings,
  type Contrato,
} from "@/types/contratos";
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
  const isMant = contrato.tipo === "mantenimiento";
  const isCombo = contrato.tipo === "implementacion_y_mantenimiento";

  const tipoLabel = TIPO_LABELS_LARGOS[contrato.tipo];
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
      ) : isMant ? (
        <ClausulasMantenimiento contrato={contrato} />
      ) : (
        <ClausulasCombo contrato={contrato} />
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
              {!isCombo && !isMant ? (
                <tr className="contrato-tr-total">
                  <td colSpan={2} className="contrato-td-total">
                    Total
                  </td>
                  <td className="contrato-td-right contrato-mono contrato-td-total">
                    {fmtMoney(contrato.monto_total, contrato.moneda)}
                  </td>
                  <td />
                </tr>
              ) : null}
              {/* Mantenimiento mensual extra: solo para tipo Implementación con
                   modalidad no-mensual que igual definió un valor recurrente. */}
              {isImpl &&
              contrato.modalidad_pago !== "unico_mas_mensual" &&
              typeof contrato.mantenimiento_mensual === "number" &&
              contrato.mantenimiento_mensual > 0 ? (
                <tr>
                  <td>Mantenimiento mensual</td>
                  <td className="contrato-td-right">—</td>
                  <td className="contrato-td-right contrato-mono">
                    {fmtMoney(contrato.mantenimiento_mensual, contrato.moneda)}
                  </td>
                  <td className="contrato-td-soft">
                    Recurrente, día 1 de cada mes posterior a la entrega
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── Plazo (sólo cuando hay implementación) ─────────────────── */}
      {(isImpl || isCombo) && contrato.plazo_implementacion ? (
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

// ─── Helpers compartidos ─────────────────────────────────────────────────────

function pagosTextoOf(contrato: Contrato): string {
  return (contrato.detalle_pagos ?? [])
    .map((d) => {
      const porc =
        typeof d.porcentaje === "number" ? ` (${d.porcentaje}%)` : "";
      const monto =
        typeof d.monto === "number"
          ? ` por ${fmtMoney(d.monto, contrato.moneda)}`
          : "";
      return `${d.etapa}${porc}${monto}`;
    })
    .join("; ");
}

function MonedaNota({ moneda }: { moneda: string }) {
  if (moneda !== "USD") return null;
  return (
    <>
      {" "}
      En caso de abonarse en pesos argentinos, los valores se calcularán al
      tipo de cambio oficial (BNA) vigente al día del pago.
    </>
  );
}

// ─── Cláusulas Implementación ────────────────────────────────────────────────

function ClausulasImplementacion({ contrato }: { contrato: Contrato }) {
  const items = contrato.alcance_items ?? [];
  const moneda = contrato.moneda;
  const pagosTexto = pagosTextoOf(contrato);
  const mensual = contrato.mantenimiento_mensual;
  const mora = contrato.mora_porcentaje ?? 10;
  const dias = contrato.dias_gracia ?? 5;
  const tieneMant = typeof mensual === "number" && mensual > 0;

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
          <MonedaNota moneda={moneda} />
          {" "}Los precios no incluyen impuestos locales (IVA).
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
          {tieneMant ? (
            <>
              {fmtMoney(mensual!, moneda)} mensual, día 1 de cada mes
              calendario, comenzando al mes siguiente de la entrega del sistema;
              mora {mora}% acumulativo después de {dias} días.{" "}
            </>
          ) : (
            "El mantenimiento mensual será definido al finalizar la implementación. "
          )}
          Incluye soporte técnico, hosting/servidor y consumo de tokens de IA
          necesarios para la operación normal del sistema. No incluye nuevas
          funcionalidades, cambios estructurales, integraciones adicionales ni
          ampliación de alcance.
          {tieneMant ? (
            <>
              {" "}
              La cuota podrá ser revisada y ajustada cada tres (3) meses según
              el desempeño del sistema, el volumen de uso real y el consumo de
              tokens de IA y servidor; cualquier ajuste será comunicado con al
              menos quince (15) días de anticipación.
            </>
          ) : null}
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
          servicio de mantenimiento mensual brindado por Codexy, posterior a la
          entrega del sistema desarrollado, ya abonado y finalizado.
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
          <strong>Pagos.</strong> Monto mensual:{" "}
          <strong>{fmtMoney(mensual, moneda)}</strong>. Día 1 de cada mes.
          Plazo de gracia: {dias} días. Vencido el plazo: suspensión + recargo{" "}
          {mora}% mensual acumulativo. Los valores expresados en {moneda}.
          <MonedaNota moneda={moneda} />
        </li>
        <li>
          <strong>Revisión trimestral.</strong> El monto del mantenimiento
          podrá ser revisado y ajustado cada tres (3) meses en función del
          desempeño del sistema, el volumen de uso, el consumo real de tokens
          de IA y los costos asociados al servidor. Cualquier ajuste será
          comunicado al cliente con al menos quince (15) días de anticipación.
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

// ─── Cláusulas Combo (Implementación + Mantenimiento) ────────────────────────

function ClausulasCombo({ contrato }: { contrato: Contrato }) {
  const items = contrato.alcance_items ?? [];
  const moneda = contrato.moneda;
  const monto = contrato.monto_total;
  const mensual = contrato.mantenimiento_mensual;
  const mora = contrato.mora_porcentaje ?? 10;
  const dias = contrato.dias_gracia ?? 5;
  const tieneMensual = typeof mensual === "number" && mensual > 0;

  return (
    <section className="contrato-section">
      <h2 className="contrato-h2">Cláusulas</h2>
      <ol className="contrato-clauses">
        <li>
          <strong>Objeto.</strong> El presente contrato comprende dos etapas
          complementarias: (i) la implementación inicial del sistema de
          automatización descripto, abonada en forma de pago único; y (ii) el
          servicio de mantenimiento mensual posterior, que asegura la
          operación continua del sistema entregado.
        </li>
        <li>
          <strong>Alcance de la Implementación.</strong> La etapa inicial
          contempla:
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
        </li>
        <li>
          <strong>Alcance del Mantenimiento Mensual.</strong> Una vez entregado
          y aprobado el sistema, EL PRESTADOR brindará un servicio mensual que
          incluye:
          <ul className="contrato-sublist">
            <li>Soporte técnico continuo del sistema entregado.</li>
            <li>
              Hosting y mantenimiento de los servidores asociados al sistema.
            </li>
            <li>
              Consumo de tokens de IA necesarios para la operación normal del
              sistema dentro del volumen estimado.
            </li>
            <li>
              Ajustes menores y asistencia sobre el funcionamiento del sistema.
            </li>
          </ul>
          <span className="contrato-not-includes">
            El mantenimiento NO incluye:
          </span>
          <ul className="contrato-sublist contrato-sublist-excl">
            <li>
              Nuevas funcionalidades, rediseños o desarrollos adicionales.
            </li>
            <li>
              Integraciones externas no incluidas en la implementación
              original.
            </li>
            <li>Campañas publicitarias o estrategias de marketing.</li>
            <li>
              Cambios estructurales que requieran un nuevo desarrollo,
              cotizables aparte.
            </li>
          </ul>
        </li>
        <li>
          <strong>Pagos.</strong> Pago único de implementación:{" "}
          <strong>{fmtMoney(monto, moneda)}</strong>, abonado a la firma del
          presente contrato.
          {tieneMensual ? (
            <>
              {" "}
              Cuota mensual de mantenimiento:{" "}
              <strong>{fmtMoney(mensual!, moneda)}</strong>, con vencimiento el
              día 1 de cada mes calendario, comenzando al mes siguiente de la
              entrega del sistema. Plazo de gracia: {dias} días. Vencido el
              plazo: suspensión del servicio + recargo {mora}% mensual
              acumulativo.
            </>
          ) : (
            " La cuota mensual de mantenimiento se definirá al finalizar la implementación."
          )}{" "}
          Los valores expresados en {moneda}.
          <MonedaNota moneda={moneda} />
          {" "}Los precios no incluyen impuestos locales (IVA).
        </li>
        <li>
          <strong>Revisión trimestral del mantenimiento.</strong> La cuota
          mensual de mantenimiento podrá ser revisada y ajustada cada tres (3)
          meses en función del desempeño del sistema, el volumen de uso real,
          el consumo de tokens de IA y los costos asociados al servidor.
          Cualquier ajuste será informado al cliente con al menos quince (15)
          días de anticipación a su entrada en vigencia. El cliente podrá
          aceptar el nuevo valor o rescindir el servicio de mantenimiento sin
          penalidad alguna.
        </li>
        <li>
          <strong>Información y Accesos.</strong> El cliente se compromete a
          entregar en tiempo y forma información, prioridades, protocolos y
          credenciales necesarias para integraciones. La falta de entrega
          puede retrasar la implementación.
        </li>
        <li>
          <strong>Pruebas y Ajustes.</strong> Se realizará una etapa de
          pruebas técnicas. El cliente deberá testear y reportar errores. Se
          realizarán correcciones dentro del alcance acordado.
        </li>
        <li>
          <strong>Soporte.</strong> Codexy brindará atención de lunes a
          viernes de 08:00 a 20:00 hs (horario Argentina), excluyendo
          feriados. Comunicaciones fuera de horario serán respondidas el
          siguiente día hábil.
        </li>
        <li>
          <strong>Costos de Plataformas Externas.</strong> El sistema puede
          utilizar plataformas de Meta (Facebook/Instagram) u otras APIs cuyo
          costo (por ejemplo USD 0,07 por conversación) es abonado
          directamente por el cliente desde sus propias cuentas. Codexy brinda
          asesoramiento pero no es responsable por cargos de terceros.
        </li>
        <li>
          <strong>Responsabilidades y Limitaciones.</strong> EL PRESTADOR no
          es responsable por interrupciones o cambios en servicios de
          terceros, caídas de servidores externos, problemas de conectividad
          ajenos al sistema entregado, ni por resultados comerciales (ventas,
          conversiones, posicionamiento). Su responsabilidad se limita al
          correcto funcionamiento del sistema según lo acordado.
        </li>
        <li>
          <strong>Confidencialidad.</strong> Ambas partes se comprometen a
          proteger la información sensible y estratégica intercambiada en el
          marco del presente acuerdo, durante y después del vínculo
          contractual.
        </li>
        <li>
          <strong>Vigencia y Rescisión.</strong> El presente acuerdo estará
          vigente desde la firma y mientras el cliente mantenga el servicio de
          mantenimiento al día. Cualquiera de las partes podrá rescindir el
          mantenimiento mensual notificando con al menos treinta (30) días de
          anticipación. La rescisión no afecta el pago de la implementación
          inicial ya abonada.
        </li>
        <li>
          <strong>Aceptación.</strong> La firma del presente documento
          implica la aceptación total de las condiciones aquí establecidas
          por ambas partes.
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
