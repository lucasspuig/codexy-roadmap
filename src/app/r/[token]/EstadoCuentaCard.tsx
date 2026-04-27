/**
 * Bloque "Estado de cuenta" para la vista pública del cliente.
 * Server Component — los datos se cargan en el page.tsx.
 */

import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileSignature,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { pagoEnMonedaContrato } from "@/lib/cambio";
import { facturadoDeContrato } from "@/lib/saldos";
import { TIPO_LABELS } from "@/types/contratos";
import {
  PAGO_METODO_LABELS,
  type PublicSaldosPayload,
} from "@/types/pagos";

interface Props {
  saldos: PublicSaldosPayload;
  /** Tipo de cambio del BNA al momento del render. Se usa como fallback
   *  cuando un pago no tiene tipo_cambio_aplicado capturado. */
  fallbackTC: number | null;
}

const NUMBER_FMT = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmt(monto: number, moneda: string): string {
  return `${moneda} ${NUMBER_FMT.format(monto)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EstadoCuentaCard({ saldos, fallbackTC }: Props) {
  // Recalcular del lado del server (este es Server Component) para:
  //  - acumular mensualidades vencidas
  //  - convertir pagos a la moneda del contrato usando el tipo_cambio_aplicado
  //    capturado al momento del pago, o el fallback (cotización BNA actual)
  //    si el pago aún no tiene TC cargado.
  const now = new Date();
  const moneda = saldos.moneda || saldos.contratos[0]?.moneda || "USD";

  const totalFacturado = saldos.contratos.reduce(
    (acc, c) => acc + facturadoDeContrato(c, now),
    0,
  );

  // Cada pago se expresa en la moneda del CONTRATO al que pertenece.
  // Para el agregado público, todos los contratos asumimos misma moneda
  // (cliente único). Convertimos pago a esa moneda.
  const totalPagado = saldos.pagos.reduce((acc, p) => {
    const c = saldos.contratos.find((x) => x.id === p.contrato_id);
    const monedaCtr = c?.moneda ?? moneda;
    return acc + pagoEnMonedaContrato(p, monedaCtr, fallbackTC);
  }, 0);

  const pendiente = Math.max(0, totalFacturado - totalPagado);
  const alDia = pendiente <= 0.005;
  const tieneAlgo =
    saldos.contratos.length > 0 ||
    saldos.pagos.length > 0 ||
    totalFacturado > 0;

  if (!tieneAlgo) return null;

  return (
    <section className="public-saldos-section">
      <div className="public-saldos-header">
        <Wallet
          size={14}
          style={{ color: "var(--color-pub-info)" }}
          aria-hidden
        />
        <h2 className="public-saldos-title">Estado de cuenta</h2>
        {alDia ? (
          <span className="public-saldos-badge public-saldos-badge--ok">
            <CheckCircle2 size={11} aria-hidden />
            Al día
          </span>
        ) : (
          <span className="public-saldos-badge public-saldos-badge--warn">
            Saldo pendiente
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="public-saldos-kpis">
        <KPI
          label="Facturado"
          value={fmt(totalFacturado, moneda)}
          tone="neutral"
        />
        <KPI
          label="Pagado"
          value={fmt(totalPagado, moneda)}
          tone="success"
        />
        <KPI
          label={alDia ? "Al día" : "Pendiente"}
          value={alDia ? "—" : fmt(pendiente, moneda)}
          tone={alDia ? "success" : "warn"}
          highlight
        />
      </div>

      {/* Contratos */}
      {saldos.contratos.length > 0 ? (
        <div className="public-saldos-block">
          <h3 className="public-saldos-h3">
            <FileSignature size={12} aria-hidden /> Contratos
          </h3>
          <ul className="public-saldos-list">
            {saldos.contratos.map((c) => {
              const firmado = c.estado === "firmado_completo";
              const verUrl = c.token_publico ? `/c/${c.token_publico}` : null;
              return (
                <li key={c.id} className="public-saldos-row">
                  <div className="public-saldos-row-main">
                    <span className="public-saldos-numero">{c.numero}</span>
                    <span className="public-saldos-tipo">
                      {TIPO_LABELS[c.tipo]}
                    </span>
                    {firmado ? (
                      <span className="public-saldos-pill public-saldos-pill--ok">
                        Firmado · {fmtDate(c.fecha_firmado_completo)}
                      </span>
                    ) : (
                      <span className="public-saldos-pill public-saldos-pill--info">
                        Pendiente de firma
                      </span>
                    )}
                  </div>
                  {c.servicio_titulo ? (
                    <p className="public-saldos-row-desc">
                      {c.servicio_titulo}
                    </p>
                  ) : null}
                  <div className="public-saldos-row-foot">
                    <span className="public-saldos-monto">
                      {fmt(c.monto_total, c.moneda)}
                    </span>
                    {c.mantenimiento_mensual && c.mantenimiento_mensual > 0 ? (
                      <span className="public-saldos-monto-sub">
                        + {fmt(c.mantenimiento_mensual, c.moneda)}/mes
                      </span>
                    ) : null}
                    {verUrl ? (
                      <a
                        className="public-saldos-link"
                        href={verUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {firmado ? "Ver contrato" : "Firmar / ver"}
                        <ExternalLink size={11} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Pagos */}
      {saldos.pagos.length > 0 ? (
        <div className="public-saldos-block">
          <h3 className="public-saldos-h3">
            <ReceiptText size={12} aria-hidden /> Pagos registrados
          </h3>
          <ul className="public-saldos-pagos">
            {saldos.pagos.slice(0, 8).map((p) => {
              const c = saldos.contratos.find((x) => x.id === p.contrato_id);
              const monedaCtr = c?.moneda ?? moneda;
              const distinta = p.moneda !== monedaCtr;
              const equivalente = distinta
                ? pagoEnMonedaContrato(p, monedaCtr, fallbackTC)
                : 0;
              return (
                <li key={p.id} className="public-saldos-pago-row">
                  <span className="public-saldos-pago-fecha">
                    {fmtDate(p.fecha_pago)}
                  </span>
                  <span className="public-saldos-pago-monto">
                    {fmt(Number(p.monto), p.moneda)}
                  </span>
                  {distinta && equivalente > 0 ? (
                    <span
                      className="public-saldos-pago-metodo"
                      style={{ opacity: 0.85 }}
                      title="Equivalente al tipo de cambio del momento"
                    >
                      ≈ {fmt(equivalente, monedaCtr)}
                    </span>
                  ) : null}
                  {p.metodo ? (
                    <span className="public-saldos-pago-metodo">
                      {PAGO_METODO_LABELS[p.metodo]}
                    </span>
                  ) : null}
                  {p.etapa ? (
                    <span className="public-saldos-pago-etapa">{p.etapa}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {saldos.pagos.length > 8 ? (
            <p className="public-saldos-mas">
              + {saldos.pagos.length - 8} pagos anteriores
            </p>
          ) : null}
        </div>
      ) : (
        <p className="public-saldos-empty">
          <CreditCard size={12} aria-hidden /> Cuando recibamos un pago, va a
          aparecer acá automáticamente.
        </p>
      )}
    </section>
  );
}

function KPI({
  label,
  value,
  tone,
  highlight = false,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warn";
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "public-saldos-kpi public-saldos-kpi--" +
        tone +
        (highlight ? " public-saldos-kpi--hi" : "")
      }
    >
      <div className="public-saldos-kpi-label">{label}</div>
      <div className="public-saldos-kpi-value">{value}</div>
    </div>
  );
}
