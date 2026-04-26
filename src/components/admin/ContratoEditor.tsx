"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Lock, Plus, Save, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dialog } from "@/components/admin/Dialog";
import { createClient } from "@/lib/supabase/client";
import { updateContrato } from "@/app/(admin)/contratos/actions";
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
      setMantenimiento(
        c.mantenimiento_mensual !== null
          ? String(c.mantenimiento_mensual)
          : "",
      );
      setMora(
        c.mora_porcentaje !== null ? String(c.mora_porcentaje) : "",
      );
      setGracia(c.dias_gracia !== null ? String(c.dias_gracia) : "");
      setNotas(c.notas_internas ?? "");
      setLoading(false);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [open, contratoId, onClose]);

  const isBorrador = contrato?.estado === "borrador";
  const printHref = contrato
    ? `/proyectos/${contrato.proyecto_id ?? "_"}/contratos/${contrato.id}/imprimir`
    : "#";

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
    // Persistir si el usuario puso un valor explícito > 0, aún sin auto.
    const persistMant =
      autoMant ||
      (Number.isFinite(mensualNum) && mensualNum > 0 && hasImpl);

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
            const tieneValor =
              mantenimiento.trim() !== "" &&
              Number.parseFloat(mantenimiento) > 0;
            const showFields = auto || tieneValor;
            const puedeQuitar = !auto && tieneValor;
            const puedeAgregar = !auto && !tieneValor;

            if (puedeAgregar) {
              return (
                <button
                  type="button"
                  onClick={() => setMantenimiento("0")}
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
        </div>
      )}
    </Dialog>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
