"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  Save,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dialog } from "@/components/admin/Dialog";
import { createClient } from "@/lib/supabase/client";
import {
  generarCuotasParaContrato,
  updateContrato,
} from "@/app/(admin)/contratos/actions";
import {
  TIPO_LABELS,
  tieneImplementacion,
  tieneMantenimiento,
  type Contrato,
  type ContratoModalidad,
  type ContratoPagoDetalle,
} from "@/types/contratos";
import { cn } from "@/lib/utils";

export interface ContratoEditorProps {
  open: boolean;
  onClose: () => void;
  contratoId: string;
  onSaved: () => void;
}

export function ContratoEditor({
  open,
  onClose,
  contratoId,
  onSaved,
}: ContratoEditorProps) {
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estado editable (solo si está en borrador)
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [alcanceItems, setAlcanceItems] = useState<string>("");
  const [alcanceExcluye, setAlcanceExcluye] = useState<string>("");
  const [plazo, setPlazo] = useState("");
  const [montoTotal, setMontoTotal] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [modalidad, setModalidad] = useState<ContratoModalidad>("50_50");
  const [mantenimiento, setMantenimiento] = useState("");
  const [mora, setMora] = useState("");
  const [gracia, setGracia] = useState("");
  const [notas, setNotas] = useState("");
  // Toggle explícito para "Mantenimiento mensual posterior" en contratos
  // de Implementación con modalidad no-mensual.
  const [showMantenimiento, setShowMantenimiento] = useState(false);
  // Plan trimestral con descuento (sólo si hay mantenimiento)
  const [planTrimestral, setPlanTrimestral] = useState(false);
  const [planDescuentoPct, setPlanDescuentoPct] = useState("10");
  // Día de cobro (1-28). Default 9 — coincide con el ciclo histórico.
  const [diaCobro, setDiaCobro] = useState("9");
  // Botón "Generar cuotas ahora" — útil para contratos no firmados todavía.
  const [generandoCuotas, setGenerandoCuotas] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contratos")
        .select("*")
        .eq("id", contratoId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("No se pudo cargar el contrato");
        onClose();
        return;
      }
      const c = data as unknown as Contrato;
      setContrato(c);
      setTitulo(c.servicio_titulo);
      setDescripcion(c.servicio_descripcion ?? "");
      setAlcanceItems((c.alcance_items ?? []).join("\n"));
      setAlcanceExcluye((c.alcance_excluye ?? []).join("\n"));
      setPlazo(c.plazo_implementacion ?? "");
      setMontoTotal(String(c.monto_total ?? ""));
      setMoneda(c.moneda || "USD");
      setModalidad(c.modalidad_pago);
      const tieneMantValor =
        c.mantenimiento_mensual !== null && c.mantenimiento_mensual > 0;
      setMantenimiento(
        c.mantenimiento_mensual !== null
          ? String(c.mantenimiento_mensual)
          : "",
      );
      setMora(
        c.mora_porcentaje !== null ? String(c.mora_porcentaje) : "10",
      );
      setGracia(c.dias_gracia !== null ? String(c.dias_gracia) : "5");
      setNotas(c.notas_internas ?? "");
      setShowMantenimiento(
        tieneMantenimiento(c.tipo, c.modalidad_pago) || tieneMantValor,
      );
      setPlanTrimestral(c.plan_periodicidad === "trimestral");
      setPlanDescuentoPct(
        c.plan_descuento_pct !== null && c.plan_descuento_pct !== undefined
          ? String(c.plan_descuento_pct)
          : "10",
      );
      setDiaCobro(
        c.dia_cobro !== undefined && c.dia_cobro !== null
          ? String(c.dia_cobro)
          : "9",
      );
      setLoading(false);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [open, contratoId, onClose]);

  const isBorrador = contrato?.estado === "borrador";
  const printHref = contrato ? `/imprimir/${contrato.id}` : "#";

  async function handleGenerarCuotas() {
    if (!contrato) return;
    setGenerandoCuotas(true);
    const res = await generarCuotasParaContrato({
      contrato_id: contrato.id,
      meses: 12,
    });
    setGenerandoCuotas(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data.cuotas_generadas === 0) {
      toast.message(
        "No se generaron cuotas nuevas (ya estaban creadas o el contrato no tiene mantenimiento mensual).",
      );
    } else {
      toast.success(`${res.data.cuotas_generadas} cuotas generadas`);
    }
  }

  // El botón aparece si el contrato tiene mantenimiento_mensual > 0. Usamos el
  // valor persistido (loaded) y no el del input local, así no aparece hasta que
  // el admin guardó la cuota.
  const tieneMantValor =
    !!contrato &&
    contrato.mantenimiento_mensual !== null &&
    Number(contrato.mantenimiento_mensual) > 0;

  async function handleSave() {
    if (!contrato || !isBorrador) return;
    const monto = Number.parseFloat(montoTotal);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSaving(true);
    const items = alcanceItems
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const excluye = alcanceExcluye
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Recalcular detalle según modalidad cuando cambia. Para custom, lo dejamos
    // como estaba previamente (UI más rica está en el wizard).
    const mensualNum = Number.parseFloat(mantenimiento);
    let detalle: ContratoPagoDetalle[] = contrato.detalle_pagos ?? [];
    if (modalidad === "unico") {
      detalle = [
        {
          etapa: "Pago único",
          porcentaje: 100,
          monto: round2(monto),
          descripcion: "Al inicio del proyecto",
        },
      ];
    } else if (modalidad === "50_50") {
      detalle = [
        {
          etapa: "Inicio del proyecto",
          porcentaje: 50,
          monto: round2(monto * 0.5),
          descripcion: "A la firma del contrato",
        },
        {
          etapa: "Entrega final",
          porcentaje: 50,
          monto: round2(monto * 0.5),
          descripcion: "Al finalizar la implementación",
        },
      ];
    } else if (modalidad === "mensual") {
      if (Number.isFinite(mensualNum) && mensualNum > 0) {
        detalle = [
          {
            etapa: "Cuota mensual",
            monto: round2(mensualNum),
            descripcion: `Día 1 de cada mes — ${moneda} ${mensualNum}`,
          },
        ];
      }
    } else if (modalidad === "unico_mas_mensual") {
      detalle = [];
      if (Number.isFinite(monto) && monto > 0) {
        detalle.push({
          etapa: "Implementación (pago único)",
          monto: round2(monto),
          descripcion: "Al inicio del proyecto, a la firma del contrato",
        });
      }
      if (Number.isFinite(mensualNum) && mensualNum > 0) {
        detalle.push({
          etapa: "Mantenimiento mensual",
          monto: round2(mensualNum),
          descripcion: `Día 1 de cada mes desde la entrega — ${moneda} ${mensualNum}`,
        });
      }
    }

    const hasImpl = tieneImplementacion(contrato.tipo);
    const autoMant = tieneMantenimiento(contrato.tipo, modalidad);
    // Persistir si auto, o si el usuario activó el toggle de mantenimiento
    // posterior en una Implementación.
    const persistMant = autoMant || (hasImpl && showMantenimiento);

    const res = await updateContrato({
      id: contrato.id,
      patch: {
        servicio_titulo: titulo.trim(),
        servicio_descripcion: descripcion.trim() || undefined,
        alcance_items: items,
        alcance_excluye: excluye,
        plazo_implementacion: hasImpl ? plazo.trim() || undefined : undefined,
        monto_total: monto,
        moneda,
        modalidad_pago: modalidad,
        detalle_pagos: detalle,
        mantenimiento_mensual: persistMant
          ? Number.isFinite(mensualNum)
            ? mensualNum
            : null
          : null,
        mora_porcentaje: persistMant ? Number.parseFloat(mora) || null : null,
        dias_gracia: persistMant ? Number.parseFloat(gracia) || null : null,
        plan_periodicidad:
          persistMant && planTrimestral ? "trimestral" : "mensual",
        plan_descuento_pct:
          persistMant && planTrimestral
            ? Number.parseFloat(planDescuentoPct) || 0
            : null,
        dia_cobro: persistMant
          ? Number.parseInt(diaCobro, 10) || 9
          : 9,
        notas_internas: notas.trim() || undefined,
      },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cambios guardados");
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={contrato ? `Editar ${contrato.numero}` : "Editar contrato"}
      description={contrato ? TIPO_LABELS[contrato.tipo] : ""}
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          {isBorrador ? (
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={loading}
            >
              <Save size={13} />
              Guardar cambios
            </Button>
          ) : null}
        </>
      }
    >
      {loading || !contrato ? (
        <div className="flex items-center justify-center py-10 text-[var(--color-t3)]">
          <Loader2 size={16} className="animate-spin mr-2" />
          Cargando contrato…
        </div>
      ) : !isBorrador ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]">
            <Lock size={16} className="text-[var(--color-warn)] mt-0.5" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-[var(--color-t1)]">
                Este contrato fue emitido y ya no puede modificarse
              </p>
              <p className="text-[11.5px] text-[var(--color-t3)] mt-0.5 leading-relaxed">
                Para hacer cambios habría que cancelarlo y emitir uno nuevo.
              </p>
            </div>
          </div>
          <a
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center justify-center gap-1.5 h-10 px-4 text-[13px] font-medium rounded-[8px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all w-full",
            )}
          >
            <ExternalLink size={13} />
            Ver contrato emitido
          </a>

          {tieneMantValor ? (
            <GenerarCuotasBlock
              loading={generandoCuotas}
              onClick={handleGenerarCuotas}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="ce-titulo">Título del servicio</Label>
            <Input
              id="ce-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="ce-desc">Descripción</Label>
            <Textarea
              id="ce-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ce-incl">Incluye (uno por línea)</Label>
              <Textarea
                id="ce-incl"
                value={alcanceItems}
                onChange={(e) => setAlcanceItems(e.target.value)}
                rows={5}
              />
            </div>
            <div>
              <Label htmlFor="ce-excl">No incluye</Label>
              <Textarea
                id="ce-excl"
                value={alcanceExcluye}
                onChange={(e) => setAlcanceExcluye(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          {tieneImplementacion(contrato.tipo) ? (
            <div>
              <Label htmlFor="ce-plazo">Plazo</Label>
              <Input
                id="ce-plazo"
                value={plazo}
                onChange={(e) => setPlazo(e.target.value)}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px] gap-3">
            <div>
              <Label htmlFor="ce-monto">Monto total</Label>
              <Input
                id="ce-monto"
                type="number"
                min="0"
                step="0.01"
                value={montoTotal}
                onChange={(e) => setMontoTotal(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ce-moneda">Moneda</Label>
              <select
                id="ce-moneda"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
            <div>
              <Label htmlFor="ce-modalidad">Modalidad</Label>
              <select
                id="ce-modalidad"
                value={modalidad}
                onChange={(e) =>
                  setModalidad(e.target.value as ContratoModalidad)
                }
                className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
              >
                <option value="unico">Único</option>
                <option value="50_50">50/50</option>
                <option value="mensual">Mensual</option>
                <option value="unico_mas_mensual">Único + mensual</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          {(() => {
            const auto = tieneMantenimiento(contrato.tipo, modalidad);
            const showFields = auto || showMantenimiento;
            const puedeQuitar = !auto && showMantenimiento;
            const puedeAgregar = !auto && !showMantenimiento;

            if (puedeAgregar) {
              return (
                <button
                  type="button"
                  onClick={() => {
                    setShowMantenimiento(true);
                    if (mora.trim() === "") setMora("10");
                    if (gracia.trim() === "") setGracia("5");
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-[12px] font-medium rounded-[8px] border border-dashed border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)] transition-colors"
                >
                  <Plus size={12} />
                  Sumar mantenimiento mensual posterior
                </button>
              );
            }

            return showFields ? (
              <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/40 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Wrench size={12} className="text-[var(--color-info)]" />
                  <span className="text-[11.5px] font-semibold text-[var(--color-t1)]">
                    Mantenimiento mensual
                  </span>
                  {puedeQuitar ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMantenimiento(false);
                        setMantenimiento("");
                        setMora("");
                        setGracia("");
                      }}
                      title="Quitar mantenimiento mensual"
                      className="ml-auto inline-flex items-center justify-center h-6 w-6 rounded text-[var(--color-t3)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
                    >
                      <X size={11} />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="ce-mens">Cuota mensual</Label>
                <Input
                  id="ce-mens"
                  type="number"
                  min="0"
                  step="0.01"
                  value={mantenimiento}
                  onChange={(e) => setMantenimiento(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ce-mora">Mora %</Label>
                <Input
                  id="ce-mora"
                  type="number"
                  min="0"
                  step="0.1"
                  value={mora}
                  onChange={(e) => setMora(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ce-grac">Días gracia</Label>
                <Input
                  id="ce-grac"
                  type="number"
                  min="0"
                  step="1"
                  value={gracia}
                  onChange={(e) => setGracia(e.target.value)}
                />
              </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3 items-end">
                  <div className="text-[11.5px] text-[var(--color-t3)] leading-relaxed">
                    <strong className="text-[var(--color-t2)]">Día del mes en que se cobra</strong> (1-28).
                    Define el ciclo automático: recordatorios día − 6 y − 3,
                    vencimiento ese día y escalación día + 1.
                  </div>
                  <div>
                    <Label htmlFor="ce-dia-cobro">Día de cobro</Label>
                    <Input
                      id="ce-dia-cobro"
                      type="number"
                      min="1"
                      max="28"
                      step="1"
                      value={diaCobro}
                      onChange={(e) => setDiaCobro(e.target.value)}
                      placeholder="9"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-t2)] cursor-pointer select-none p-2.5 rounded-[8px] border border-dashed border-[var(--color-b1)] bg-[var(--color-s1)]/40 hover:border-[var(--color-b2)] transition-colors">
                    <input
                      type="checkbox"
                      checked={planTrimestral}
                      onChange={(e) => setPlanTrimestral(e.target.checked)}
                      className="w-3.5 h-3.5 mt-0.5 accent-[var(--color-brand)]"
                    />
                    <span className="flex-1">
                      <span className="block font-semibold text-[var(--color-t1)]">
                        Plan trimestral con descuento
                      </span>
                      <span className="text-[11.5px] text-[var(--color-t3)] block leading-relaxed mt-0.5">
                        Cobrá tres meses por adelantado a cambio de un descuento.
                      </span>
                    </span>
                  </label>
                  {planTrimestral ? (
                    <PlanTrimestralPreview
                      cuotaMensual={mantenimiento}
                      descuentoPct={planDescuentoPct}
                      moneda={moneda}
                      onChangeDescuento={setPlanDescuentoPct}
                    />
                  ) : null}
                </div>
              </div>
            ) : null;
          })()}
          <div>
            <Label htmlFor="ce-notas">Notas internas (privadas)</Label>
            <Textarea
              id="ce-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Solo visibles para el equipo Codexy."
            />
          </div>

          {tieneMantValor ? (
            <GenerarCuotasBlock
              loading={generandoCuotas}
              onClick={handleGenerarCuotas}
            />
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function GenerarCuotasBlock({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--color-info-border)] bg-[var(--color-info-muted)] p-3.5">
      <div className="flex items-start gap-2">
        <CalendarClock size={14} className="text-[var(--color-info)] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-[var(--color-t1)]">
            Generar cuotas para los próximos 12 meses
          </p>
          <p className="text-[11px] text-[var(--color-t3)] mt-0.5 leading-relaxed">
            Útil si todavía no se firmó pero querés empezar a trackear pagos
            ahora. Idempotente: las cuotas que ya existen no se duplican.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onClick}
          loading={loading}
        >
          <Zap size={12} />
          Generar
        </Button>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function PlanTrimestralPreview({
  cuotaMensual,
  descuentoPct,
  moneda,
  onChangeDescuento,
}: {
  cuotaMensual: string;
  descuentoPct: string;
  moneda: string;
  onChangeDescuento: (v: string) => void;
}) {
  const cuota = Number.parseFloat(cuotaMensual);
  const pct = Number.parseFloat(descuentoPct);
  const cuotaValida = Number.isFinite(cuota) && cuota > 0;
  const pctValido = Number.isFinite(pct) && pct >= 0 && pct < 100;
  const totalSinDesc = cuotaValida ? cuota * 3 : 0;
  const totalConDesc =
    cuotaValida && pctValido ? totalSinDesc * (1 - pct / 100) : 0;
  const fmt = (n: number): string =>
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 items-end">
      <div>
        <Label htmlFor="ce-desc-pct">% descuento</Label>
        <Input
          id="ce-desc-pct"
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={descuentoPct}
          onChange={(e) => onChangeDescuento(e.target.value)}
          placeholder="10"
        />
      </div>
      <div className="text-[11.5px] text-[var(--color-t2)] leading-relaxed pb-2">
        {cuotaValida && pctValido ? (
          <span>
            <span style={{ fontFamily: "var(--ff-mono)" }}>
              {moneda} {fmt(cuota)}
            </span>{" "}
            × 3 ={" "}
            <span style={{ fontFamily: "var(--ff-mono)" }}>
              {moneda} {fmt(totalSinDesc)}
            </span>
            . Con {pct}% off ={" "}
            <span
              className="text-[var(--color-brand)] font-semibold"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              {moneda} {fmt(totalConDesc)}
            </span>
            .
          </span>
        ) : (
          <span className="text-[var(--color-t3)] italic">
            Cargá la cuota mensual y un % válido.
          </span>
        )}
      </div>
    </div>
  );
}
