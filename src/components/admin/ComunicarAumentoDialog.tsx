"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Dialog } from "@/components/admin/Dialog";
import {
  comunicarAumentoMasivo,
  listClientesConCobroActivo,
  type ClienteConCobro,
} from "@/app/(admin)/cobros/actions";
import { cn } from "@/lib/utils";

export interface ComunicarAumentoDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

/**
 * Comunica un aumento de tarifa a un grupo de clientes:
 *   - Actualiza el mantenimiento_mensual del contrato
 *   - Actualiza las cuotas futuras pendientes con el nuevo monto
 *   - Manda el WA con el template aviso_aumento
 */
export function ComunicarAumentoDialog({
  open,
  onClose,
  onApplied,
}: ComunicarAumentoDialogProps) {
  const [delta, setDelta] = useState("10");
  const [periodoDesde, setPeriodoDesde] = useState(() => proximoMesYM());
  const [clientes, setClientes] = useState<ClienteConCobro[]>([]);
  const [loading, setLoading] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [resultados, setResultados] = useState<
    Array<{ cliente_nombre: string; ok: boolean; error?: string }> | null
  >(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setResultados(null);
    setDelta("10");
    setPeriodoDesde(proximoMesYM());
    (async () => {
      const res = await listClientesConCobroActivo();
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setClientes([]);
        setLoading(false);
        return;
      }
      setClientes(res.data);
      // Seleccionamos todos por default
      setSeleccionados(new Set(res.data.map((c) => c.contrato_id)));
      setLoading(false);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [open]);

  const deltaNum = Number.parseFloat(delta);
  const isDeltaValid = Number.isFinite(deltaNum) && deltaNum !== 0;

  const totales = useMemo(() => {
    const seleccionadasList = clientes.filter((c) =>
      seleccionados.has(c.contrato_id),
    );
    const ingresosActuales = seleccionadasList.reduce(
      (acc, c) => acc + c.monto_actual_usd,
      0,
    );
    const ingresosNuevos = seleccionadasList.reduce(
      (acc, c) => acc + Math.max(0, c.monto_actual_usd + (deltaNum || 0)),
      0,
    );
    return {
      cantidad: seleccionadasList.length,
      ingresosActuales,
      ingresosNuevos,
      diff: ingresosNuevos - ingresosActuales,
    };
  }, [clientes, seleccionados, deltaNum]);

  function toggleAll() {
    if (seleccionados.size === clientes.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(clientes.map((c) => c.contrato_id)));
    }
  }

  function toggleOne(contratoId: string) {
    const next = new Set(seleccionados);
    if (next.has(contratoId)) next.delete(contratoId);
    else next.add(contratoId);
    setSeleccionados(next);
  }

  async function handleSubmit() {
    if (!isDeltaValid) {
      toast.error("Ingresá un delta válido (en USD, ≠ 0)");
      return;
    }
    if (seleccionados.size === 0) {
      toast.error("Seleccioná al menos un cliente");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(periodoDesde)) {
      toast.error("Período inválido");
      return;
    }

    setSubmitting(true);
    const res = await comunicarAumentoMasivo({
      delta_usd: deltaNum,
      periodo_desde: periodoDesde,
      contrato_ids: Array.from(seleccionados),
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResultados(res.data.resultados);
    const okCount = res.data.resultados.filter((r) => r.ok).length;
    const failCount = res.data.resultados.length - okCount;
    if (failCount === 0) {
      toast.success(`Aumento aplicado a ${okCount} cliente${okCount === 1 ? "" : "s"}`);
    } else {
      toast.error(`Aumento aplicado a ${okCount}/${res.data.resultados.length} (${failCount} fallaron)`);
    }
    onApplied();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Comunicar aumento de tarifa"
      description="Actualiza la cuota mensual y envía aviso por WhatsApp a los clientes seleccionados."
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {resultados ? "Cerrar" : "Cancelar"}
          </Button>
          {!resultados ? (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!isDeltaValid || seleccionados.size === 0}
            >
              <Megaphone size={13} />
              Aplicar y comunicar
            </Button>
          ) : null}
        </>
      }
    >
      {resultados ? (
        <ResultadosView resultados={resultados} />
      ) : (
        <div className="space-y-4">
          {/* Parámetros */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <div>
              <Label htmlFor="aum-delta">Aumento en USD *</Label>
              <Input
                id="aum-delta"
                type="number"
                step="0.01"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="10"
              />
              <p className="text-[11px] text-[var(--color-t3)] mt-1">
                Cuánto SUMÁS al monto actual (positivo = aumento, negativo = baja).
              </p>
            </div>
            <div>
              <Label htmlFor="aum-periodo">Aplica desde</Label>
              <Input
                id="aum-periodo"
                type="month"
                value={periodoDesde}
                onChange={(e) => setPeriodoDesde(e.target.value)}
              />
            </div>
          </div>

          {/* Resumen de impacto */}
          {totales.cantidad > 0 ? (
            <div className="rounded-[10px] border border-[var(--color-brand-border)] bg-[var(--color-brand-muted)] px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-[var(--color-brand)]" />
                <span className="text-[11.5px] font-semibold text-[var(--color-t1)] uppercase tracking-wide">
                  Impacto del aumento
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div>
                  <div className="text-[10.5px] text-[var(--color-t3)]">CLIENTES</div>
                  <div className="text-[15px] font-bold text-[var(--color-t1)]">
                    {totales.cantidad}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-[var(--color-t3)]">MRR ACTUAL</div>
                  <div
                    className="text-[15px] font-semibold text-[var(--color-t2)]"
                    style={{ fontFamily: "var(--ff-mono)" }}
                  >
                    USD {totales.ingresosActuales.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-[var(--color-t3)]">MRR NUEVO</div>
                  <div
                    className="text-[15px] font-bold text-[var(--color-brand)]"
                    style={{ fontFamily: "var(--ff-mono)" }}
                  >
                    USD {totales.ingresosNuevos.toFixed(0)}
                    {totales.diff !== 0 ? (
                      <span className="text-[11px] ml-1.5 text-[var(--color-t3)]">
                        ({totales.diff > 0 ? "+" : ""}
                        {totales.diff.toFixed(0)})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Lista de clientes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="mb-0">
                Clientes con cobro mensual ({clientes.length})
              </Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] text-[var(--color-info)] hover:underline"
              >
                {seleccionados.size === clientes.length ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
            </div>

            {loading ? (
              <div className="text-[12px] text-[var(--color-t3)] italic px-3 py-4">
                Cargando clientes…
              </div>
            ) : clientes.length === 0 ? (
              <div className="text-[12px] text-[var(--color-t3)] italic px-3 py-4 border border-dashed border-[var(--color-b1)] rounded-[8px]">
                No hay clientes con contrato activo de mantenimiento.
              </div>
            ) : (
              <ul className="max-h-[280px] overflow-y-auto rounded-[8px] border border-[var(--color-b1)] divide-y divide-[var(--color-b1)]">
                {clientes.map((c) => {
                  const checked = seleccionados.has(c.contrato_id);
                  const nuevoMonto = Math.max(
                    0,
                    c.monto_actual_usd + (deltaNum || 0),
                  );
                  return (
                    <li
                      key={c.contrato_id}
                      className={cn(
                        "px-3 py-2 flex items-center gap-3 cursor-pointer transition-colors",
                        checked
                          ? "bg-[var(--color-brand-muted)]/40"
                          : "hover:bg-[var(--color-s2)]/40",
                      )}
                      onClick={() => toggleOne(c.contrato_id)}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(c.contrato_id)}
                        className="w-3.5 h-3.5 accent-[var(--color-brand)]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12.5px] font-medium text-[var(--color-t1)]">
                            {c.cliente_nombre}
                          </span>
                          {c.cliente_empresa ? (
                            <span className="text-[11px] text-[var(--color-t3)] truncate">
                              · {c.cliente_empresa}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="text-[10.5px] text-[var(--color-t3)] mt-0.5"
                          style={{ fontFamily: "var(--ff-mono)" }}
                        >
                          {c.contrato_numero} ·{" "}
                          {c.cliente_telefono || "(sin teléfono)"}
                        </div>
                      </div>
                      <div
                        className="text-right tabular-nums"
                        style={{ fontFamily: "var(--ff-mono)" }}
                      >
                        <div className="text-[11px] text-[var(--color-t3)]">
                          USD {c.monto_actual_usd.toFixed(0)}
                        </div>
                        {checked && isDeltaValid ? (
                          <div className="text-[12px] font-bold text-[var(--color-brand)]">
                            → USD {nuevoMonto.toFixed(0)}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="text-[11px] text-[var(--color-t3)] leading-relaxed border-t border-[var(--color-b1)] pt-3">
            ⚠️ Esta acción <strong>actualiza el monto del contrato</strong> y todas
            las <strong>cuotas pendientes</strong> a partir del período elegido. Las
            cuotas pagadas o canceladas <strong>no se tocan</strong>. También manda
            un WhatsApp al cliente avisando del cambio (template{" "}
            <code>aviso_aumento</code> editable en /configuración).
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ResultadosView({
  resultados,
}: {
  resultados: Array<{ cliente_nombre: string; ok: boolean; error?: string }>;
}) {
  const okCount = resultados.filter((r) => r.ok).length;
  const failCount = resultados.length - okCount;

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/40 p-3">
        <div className="text-[12px] font-semibold mb-1.5">Resumen</div>
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div className="text-[var(--color-brand)]">
            ✅ {okCount} OK
          </div>
          <div className="text-[var(--color-danger)]">
            {failCount > 0 ? `❌ ${failCount} fallaron` : ""}
          </div>
        </div>
      </div>
      <ul className="max-h-[320px] overflow-y-auto rounded-[8px] border border-[var(--color-b1)] divide-y divide-[var(--color-b1)]">
        {resultados.map((r, i) => (
          <li key={i} className="px-3 py-2 text-[12px]">
            <div className="flex items-center gap-2">
              <span>{r.ok ? "✅" : "❌"}</span>
              <span className="font-medium text-[var(--color-t1)]">
                {r.cliente_nombre}
              </span>
            </div>
            {r.error ? (
              <div className="text-[10.5px] text-[var(--color-danger)] mt-1 ml-6">
                {r.error}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Devuelve "YYYY-MM" del MES SIGUIENTE al actual. */
function proximoMesYM(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
