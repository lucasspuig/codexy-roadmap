"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calculator,
  Check,
  Layers,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dialog } from "@/components/admin/Dialog";
import { createContrato } from "@/app/(admin)/contratos/actions";
import {
  ALCANCE_COMBO_DEFAULT,
  ALCANCE_COMBO_EXCLUYE,
  ALCANCE_IMPLEMENTACION_DEFAULT,
  ALCANCE_IMPLEMENTACION_EXCLUYE,
  ALCANCE_MANTENIMIENTO_DEFAULT,
  ALCANCE_MANTENIMIENTO_EXCLUYE,
  tieneImplementacion,
  tieneMantenimiento,
  type ContratoModalidad,
  type ContratoPagoDetalle,
  type ContratoTipo,
} from "@/types/contratos";
import { cn } from "@/lib/utils";

export interface ContratoWizardProps {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  proyectoId?: string;
  clienteNombre: string;
  clienteEmpresa: string | null;
  onCreated: () => void;
}

interface WizardState {
  tipo: ContratoTipo;
  servicio_titulo: string;
  servicio_descripcion: string;
  alcance_items: string[];
  alcance_excluye: string[];
  plazo_implementacion: string;
  monto_total: string; // mantenido como string para input controlado
  moneda: string;
  modalidad_pago: ContratoModalidad;
  detalle_pagos: ContratoPagoDetalle[];
  mantenimiento_mensual: string;
  mora_porcentaje: string;
  dias_gracia: string;
  /** Solo aplica a tipo "implementacion" con modalidad no-mensual. Toggle para sumar
   * una cuota mensual de mantenimiento posterior al desarrollo inicial. */
  incluir_mantenimiento: boolean;
}

const STEPS = [
  { id: 1, label: "Tipo y servicio", icon: Briefcase },
  { id: 2, label: "Alcance y plazo", icon: ListChecks },
  { id: 3, label: "Económicos", icon: Calculator },
] as const;

function defaultTituloFor(
  tipo: ContratoTipo,
  empresa: string | null,
  nombre: string,
): string {
  const cliente = empresa || nombre;
  if (tipo === "implementacion") {
    return `Implementación de sistema de automatización · ${cliente}`;
  }
  if (tipo === "mantenimiento") {
    return `Mantenimiento mensual · ${cliente}`;
  }
  // combo
  return `Implementación + Mantenimiento mensual · ${cliente}`;
}

function defaultsAlcanceFor(tipo: ContratoTipo): {
  items: string[];
  excluye: string[];
} {
  if (tipo === "implementacion") {
    return {
      items: [...ALCANCE_IMPLEMENTACION_DEFAULT],
      excluye: [...ALCANCE_IMPLEMENTACION_EXCLUYE],
    };
  }
  if (tipo === "mantenimiento") {
    return {
      items: [...ALCANCE_MANTENIMIENTO_DEFAULT],
      excluye: [...ALCANCE_MANTENIMIENTO_EXCLUYE],
    };
  }
  return {
    items: [...ALCANCE_COMBO_DEFAULT],
    excluye: [...ALCANCE_COMBO_EXCLUYE],
  };
}

function defaultModalidadFor(tipo: ContratoTipo): ContratoModalidad {
  if (tipo === "mantenimiento") return "mensual";
  if (tipo === "implementacion_y_mantenimiento") return "unico_mas_mensual";
  return "50_50";
}

function initialState(
  tipo: ContratoTipo,
  empresa: string | null,
  nombre: string,
): WizardState {
  const al = defaultsAlcanceFor(tipo);
  const modalidad = defaultModalidadFor(tipo);
  return {
    tipo,
    servicio_titulo: defaultTituloFor(tipo, empresa, nombre),
    servicio_descripcion: "",
    alcance_items: al.items,
    alcance_excluye: al.excluye,
    plazo_implementacion: tieneImplementacion(tipo) ? "3 a 6 semanas" : "",
    monto_total: "",
    moneda: "USD",
    modalidad_pago: modalidad,
    detalle_pagos: [],
    mantenimiento_mensual: "",
    mora_porcentaje: "10",
    dias_gracia: "5",
    incluir_mantenimiento: tieneMantenimiento(tipo, modalidad),
  };
}

export function ContratoWizard({
  open,
  onClose,
  clienteId,
  proyectoId,
  clienteNombre,
  clienteEmpresa,
  onCreated,
}: ContratoWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state, setState] = useState<WizardState>(() =>
    initialState("implementacion", clienteEmpresa, clienteNombre),
  );
  const [submitting, setSubmitting] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(1);
      setState(initialState("implementacion", clienteEmpresa, clienteNombre));
    }
  }, [open, clienteEmpresa, clienteNombre]);

  function patch(p: Partial<WizardState>) {
    setState((s) => ({ ...s, ...p }));
  }

  function changeTipo(tipo: ContratoTipo) {
    // Re-aplica defaults consistentes con el nuevo tipo
    const al = defaultsAlcanceFor(tipo);
    const modalidad = defaultModalidadFor(tipo);
    setState((s) => ({
      ...s,
      tipo,
      servicio_titulo: defaultTituloFor(tipo, clienteEmpresa, clienteNombre),
      alcance_items: al.items,
      alcance_excluye: al.excluye,
      plazo_implementacion: tieneImplementacion(tipo) ? "3 a 6 semanas" : "",
      modalidad_pago: modalidad,
      incluir_mantenimiento: tieneMantenimiento(tipo, modalidad),
    }));
  }

  // Detalle de pagos generado automáticamente según modalidad
  const computedDetalle: ContratoPagoDetalle[] = useMemo(() => {
    const monto = Number.parseFloat(state.monto_total);
    if (state.modalidad_pago === "unico") {
      if (!Number.isFinite(monto) || monto <= 0) return [];
      return [
        {
          etapa: "Pago único",
          porcentaje: 100,
          monto: round2(monto),
          descripcion: "Al inicio del proyecto",
        },
      ];
    }
    if (state.modalidad_pago === "50_50") {
      if (!Number.isFinite(monto) || monto <= 0) return [];
      return [
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
    }
    if (state.modalidad_pago === "mensual") {
      const mensual = Number.parseFloat(state.mantenimiento_mensual);
      if (!Number.isFinite(mensual) || mensual <= 0) return [];
      return [
        {
          etapa: "Cuota mensual",
          monto: round2(mensual),
          descripcion: `Día 1 de cada mes — ${state.moneda} ${mensual}`,
        },
      ];
    }
    if (state.modalidad_pago === "unico_mas_mensual") {
      const mensual = Number.parseFloat(state.mantenimiento_mensual);
      const out: ContratoPagoDetalle[] = [];
      if (Number.isFinite(monto) && monto > 0) {
        out.push({
          etapa: "Implementación (pago único)",
          monto: round2(monto),
          descripcion: "Al inicio del proyecto, a la firma del contrato",
        });
      }
      if (Number.isFinite(mensual) && mensual > 0) {
        out.push({
          etapa: "Mantenimiento mensual",
          monto: round2(mensual),
          descripcion: `Día 1 de cada mes desde la entrega — ${state.moneda} ${mensual}`,
        });
      }
      return out;
    }
    return state.detalle_pagos;
  }, [
    state.modalidad_pago,
    state.monto_total,
    state.detalle_pagos,
    state.mantenimiento_mensual,
    state.moneda,
  ]);

  function canAdvance(): boolean {
    if (step === 1) {
      return state.tipo !== undefined && state.servicio_titulo.trim().length > 2;
    }
    if (step === 2) {
      return state.alcance_items.length > 0;
    }
    return false;
  }

  function canSubmit(): boolean {
    const monto = Number.parseFloat(state.monto_total);
    if (!Number.isFinite(monto) || monto <= 0) return false;
    // Para modalidades con cuota mensual, exigir mantenimiento_mensual > 0
    if (
      state.modalidad_pago === "mensual" ||
      state.modalidad_pago === "unico_mas_mensual"
    ) {
      const m = Number.parseFloat(state.mantenimiento_mensual);
      if (!Number.isFinite(m) || m <= 0) return false;
    }
    // Si activó mantenimiento posterior, exigir cuota > 0
    if (state.incluir_mantenimiento && state.tipo === "implementacion") {
      const m = Number.parseFloat(state.mantenimiento_mensual);
      if (!Number.isFinite(m) || m <= 0) return false;
    }
    if (state.modalidad_pago === "custom" && state.detalle_pagos.length === 0) {
      return false;
    }
    return true;
  }

  async function handleCreate() {
    if (!canSubmit()) {
      toast.error("Faltan datos económicos para crear el contrato");
      return;
    }
    setSubmitting(true);
    const monto = Number.parseFloat(state.monto_total);
    const mensual = Number.parseFloat(state.mantenimiento_mensual);
    const mora = Number.parseFloat(state.mora_porcentaje);
    const gracia = Number.parseFloat(state.dias_gracia);

    const detalle =
      state.modalidad_pago === "custom"
        ? state.detalle_pagos
        : computedDetalle;
    const persistMantenimiento =
      tieneMantenimiento(state.tipo, state.modalidad_pago) ||
      (state.tipo === "implementacion" && state.incluir_mantenimiento);

    const res = await createContrato({
      cliente_id: clienteId,
      proyecto_id: proyectoId ?? null,
      tipo: state.tipo,
      servicio_titulo: state.servicio_titulo.trim(),
      servicio_descripcion: state.servicio_descripcion.trim() || undefined,
      alcance_items: state.alcance_items
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      alcance_excluye: state.alcance_excluye
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      plazo_implementacion: tieneImplementacion(state.tipo)
        ? state.plazo_implementacion.trim() || undefined
        : undefined,
      monto_total: monto,
      moneda: state.moneda,
      modalidad_pago: state.modalidad_pago,
      detalle_pagos: detalle,
      mantenimiento_mensual: persistMantenimiento
        ? Number.isFinite(mensual)
          ? mensual
          : null
        : null,
      mora_porcentaje: persistMantenimiento
        ? Number.isFinite(mora)
          ? mora
          : null
        : null,
      dias_gracia: persistMantenimiento
        ? Number.isFinite(gracia)
          ? gracia
          : null
        : null,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Borrador ${res.data.numero} creado`);
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Nuevo contrato"
      description={`Para ${clienteEmpresa || clienteNombre}`}
      maxWidth="640px"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--color-t3)]">
            Paso {step} de 3
          </span>
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <Button
                variant="secondary"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                disabled={submitting}
              >
                <ArrowLeft size={13} />
                Atrás
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancelar
              </Button>
            )}
            {step < 3 ? (
              <Button
                variant="primary"
                onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
                disabled={!canAdvance()}
              >
                Siguiente
                <ArrowRight size={13} />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleCreate}
                loading={submitting}
                disabled={!canSubmit()}
              >
                <Sparkles size={13} />
                Crear borrador
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Stepper current={step} />
      <div className="mt-4">
        {step === 1 ? (
          <Step1
            state={state}
            onChangeTipo={changeTipo}
            onChange={patch}
            clienteEmpresa={clienteEmpresa}
            clienteNombre={clienteNombre}
          />
        ) : step === 2 ? (
          <Step2 state={state} onChange={patch} />
        ) : (
          <Step3 state={state} onChange={patch} computedDetalle={computedDetalle} />
        )}
      </div>
    </Dialog>
  );
}

// ─── Stepper visual ──────────────────────────────────────────────────────────

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-medium">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const active = current === s.id;
        const past = current > s.id;
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors",
              active &&
                "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]",
              past && !active &&
                "bg-[var(--color-info-muted)] border-[var(--color-info-border)] text-[var(--color-info)]",
              !active && !past &&
                "border-[var(--color-b1)] text-[var(--color-t3)]",
            )}
          >
            {past ? <Check size={11} /> : <Icon size={11} />}
            <span>{s.label}</span>
            {i < STEPS.length - 1 ? (
              <span className="ml-1 text-[var(--color-t3)]">·</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Step 1 ──────────────────────────────────────────────────────────────────

function Step1({
  state,
  onChangeTipo,
  onChange,
  clienteEmpresa,
  clienteNombre,
}: {
  state: WizardState;
  onChangeTipo: (t: ContratoTipo) => void;
  onChange: (p: Partial<WizardState>) => void;
  clienteEmpresa: string | null;
  clienteNombre: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Tipo de contrato</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
          <RadioCard
            active={state.tipo === "implementacion"}
            onClick={() => onChangeTipo("implementacion")}
            icon={<Sparkles size={14} />}
            title="Implementación"
            description="Solo el desarrollo inicial. Pago único o 50/50."
          />
          <RadioCard
            active={state.tipo === "mantenimiento"}
            onClick={() => onChangeTipo("mantenimiento")}
            icon={<Wrench size={14} />}
            title="Mantenimiento"
            description="Cuota mensual: soporte, servidor y tokens de IA."
          />
          <RadioCard
            active={state.tipo === "implementacion_y_mantenimiento"}
            onClick={() =>
              onChangeTipo("implementacion_y_mantenimiento")
            }
            icon={<Layers size={14} />}
            title="Implementación + Mantenimiento"
            description="Pago único de implementación y luego cuota mensual recurrente."
          />
        </div>
      </div>
      <div>
        <Label htmlFor="cw-titulo">Título del servicio *</Label>
        <Input
          id="cw-titulo"
          value={state.servicio_titulo}
          onChange={(e) => onChange({ servicio_titulo: e.target.value })}
          placeholder={defaultTituloFor(
            state.tipo,
            clienteEmpresa,
            clienteNombre,
          )}
          maxLength={200}
        />
      </div>
      <div>
        <Label htmlFor="cw-desc">Descripción del servicio (opcional)</Label>
        <Textarea
          id="cw-desc"
          value={state.servicio_descripcion}
          onChange={(e) => onChange({ servicio_descripcion: e.target.value })}
          placeholder="Detalles específicos a destacar en el contrato."
          rows={3}
        />
      </div>
    </div>
  );
}

function RadioCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-3.5 rounded-[10px] border transition-all",
        active
          ? "border-[var(--color-brand)] bg-[var(--color-brand-muted)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_10%,transparent)]"
          : "border-[var(--color-b1)] bg-[var(--color-s2)] hover:border-[var(--color-b2)]",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            "inline-flex items-center justify-center w-6 h-6 rounded-[6px]",
            active
              ? "bg-[var(--color-brand)] text-white"
              : "bg-[var(--color-s3)] text-[var(--color-t3)]",
          )}
        >
          {icon}
        </span>
        <span className="text-[13px] font-semibold text-[var(--color-t1)]">
          {title}
        </span>
        {active ? (
          <Check
            size={13}
            className="ml-auto text-[var(--color-brand)]"
            strokeWidth={2.5}
          />
        ) : null}
      </div>
      <p className="text-[11.5px] text-[var(--color-t3)] leading-relaxed">
        {description}
      </p>
    </button>
  );
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────

function Step2({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
}) {
  return (
    <div className="space-y-5">
      <ListEditor
        label="Incluye"
        helper="Items que el cliente recibirá."
        items={state.alcance_items}
        onChange={(items) => onChange({ alcance_items: items })}
        placeholder="Ej. Configuración del sistema X"
      />
      <ListEditor
        label="No incluye"
        helper="Aclaración explícita de lo que queda fuera del alcance."
        items={state.alcance_excluye}
        onChange={(items) => onChange({ alcance_excluye: items })}
        placeholder="Ej. Campañas publicitarias"
      />
      {tieneImplementacion(state.tipo) ? (
        <div>
          <Label htmlFor="cw-plazo">Plazo de implementación</Label>
          <Input
            id="cw-plazo"
            value={state.plazo_implementacion}
            onChange={(e) => onChange({ plazo_implementacion: e.target.value })}
            placeholder="3 a 6 semanas"
          />
          <p className="text-[11px] text-[var(--color-t3)] mt-1.5">
            Texto libre. Aparece en la cláusula de Pagos del contrato.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ListEditor({
  label,
  helper,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  helper?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  function update(idx: number, value: string) {
    const next = [...items];
    next[idx] = value;
    onChange(next);
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...items, ""]);
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="mb-0">{label}</Label>
        <span className="text-[10.5px] text-[var(--color-t3)]">
          {items.length} {items.length === 1 ? "ítem" : "ítems"}
        </span>
      </div>
      {helper ? (
        <p className="text-[11px] text-[var(--color-t3)] mb-2">{helper}</p>
      ) : null}
      <ul className="space-y-1.5">
        {items.map((it, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <span className="w-[18px] h-[18px] rounded-[5px] border border-[var(--color-b2)] bg-[var(--color-s3)] flex items-center justify-center text-[var(--color-t3)] flex-shrink-0">
              <Check size={10} strokeWidth={3} />
            </span>
            <input
              type="text"
              value={it}
              onChange={(e) => update(idx, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent border-b border-transparent hover:border-[var(--color-b1)] focus:border-[var(--color-info)] text-[13px] py-1 outline-none transition-colors text-[var(--color-t2)]"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label="Eliminar ítem"
              className="h-6 w-6 rounded flex items-center justify-center text-[var(--color-t3)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-t3)] border border-dashed border-[var(--color-b1)] rounded-[6px] px-3 py-1.5 hover:border-[var(--color-info)] hover:text-[var(--color-info)] transition-colors"
      >
        <Plus size={11} />
        Agregar ítem
      </button>
    </div>
  );
}

// ─── Step 3 ──────────────────────────────────────────────────────────────────

function Step3({
  state,
  onChange,
  computedDetalle,
}: {
  state: WizardState;
  onChange: (p: Partial<WizardState>) => void;
  computedDetalle: ContratoPagoDetalle[];
}) {
  function updateCustomEtapa(idx: number, patch: Partial<ContratoPagoDetalle>) {
    const next = state.detalle_pagos.map((d, i) =>
      i === idx ? { ...d, ...patch } : d,
    );
    onChange({ detalle_pagos: next });
  }
  function addCustomEtapa() {
    onChange({
      detalle_pagos: [
        ...state.detalle_pagos,
        { etapa: "", porcentaje: undefined, monto: undefined, descripcion: "" },
      ],
    });
  }
  function removeCustomEtapa(idx: number) {
    onChange({
      detalle_pagos: state.detalle_pagos.filter((_, i) => i !== idx),
    });
  }

  const autoMantenimiento = tieneMantenimiento(
    state.tipo,
    state.modalidad_pago,
  );
  const isCombo = state.tipo === "implementacion_y_mantenimiento";
  const isMantOnly = state.tipo === "mantenimiento";
  // Para tipo Implementación con modalidades no-mensuales, el mantenimiento es opcional.
  const puedeAgregarMantenimiento =
    state.tipo === "implementacion" && !autoMantenimiento;
  const showMantenimientoFields =
    autoMantenimiento ||
    (puedeAgregarMantenimiento && state.incluir_mantenimiento);
  const montoLabel = isCombo
    ? "Pago único de implementación *"
    : isMantOnly
      ? "Monto de referencia anual"
      : "Monto total *";
  const montoHint = isCombo
    ? "Lo que se cobra a la firma para el desarrollo inicial."
    : isMantOnly
      ? "Sirve como referencia. La cuota mensual va en el campo de abajo."
      : "Monto del proyecto, distribuido según la modalidad elegida.";

  // Modalidades disponibles según el tipo seleccionado.
  const modalidades: Array<{ id: ContratoModalidad; label: string }> = isCombo
    ? [{ id: "unico_mas_mensual", label: "Único + mensual" }]
    : isMantOnly
      ? [{ id: "mensual", label: "Mensual" }]
      : [
          { id: "unico", label: "Único" },
          { id: "50_50", label: "50 / 50" },
          { id: "custom", label: "Custom" },
        ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
        <div>
          <Label htmlFor="cw-monto">{montoLabel}</Label>
          <Input
            id="cw-monto"
            type="number"
            min="0"
            step="0.01"
            value={state.monto_total}
            onChange={(e) => onChange({ monto_total: e.target.value })}
            placeholder="0.00"
          />
          <p className="text-[11px] text-[var(--color-t3)] mt-1.5">
            {montoHint}
          </p>
        </div>
        <div>
          <Label htmlFor="cw-moneda">Moneda</Label>
          <select
            id="cw-moneda"
            value={state.moneda}
            onChange={(e) => onChange({ moneda: e.target.value })}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
          >
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>
      </div>

      {modalidades.length > 1 ? (
        <div>
          <Label>Modalidad de pago</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
            {modalidades.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ modalidad_pago: opt.id })}
                className={cn(
                  "text-[12px] font-medium px-3 py-2 rounded-[7px] border transition-all",
                  state.modalidad_pago === opt.id
                    ? "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]"
                    : "bg-[var(--color-s2)] border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {puedeAgregarMantenimiento ? (
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-t2)] cursor-pointer select-none p-3 rounded-[10px] border border-dashed border-[var(--color-b1)] bg-[var(--color-s2)]/30 hover:border-[var(--color-b2)] transition-colors">
          <input
            type="checkbox"
            checked={state.incluir_mantenimiento}
            onChange={(e) =>
              onChange({ incluir_mantenimiento: e.target.checked })
            }
            className="w-3.5 h-3.5 mt-0.5 accent-[var(--color-brand)]"
          />
          <span className="flex-1">
            <span className="block font-semibold text-[var(--color-t1)]">
              Sumar mantenimiento mensual posterior
            </span>
            <span className="text-[11.5px] text-[var(--color-t3)] block leading-relaxed mt-0.5">
              Cobrá una cuota mensual recurrente al cliente además del pago de
              implementación. Cubre soporte, servidor y tokens IA.
            </span>
          </span>
        </label>
      ) : null}

      {showMantenimientoFields ? (
        <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/40 p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench size={12} className="text-[var(--color-info)]" />
            <span className="text-[11.5px] font-semibold text-[var(--color-t1)]">
              Mantenimiento mensual
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-t3)] mb-3 leading-relaxed">
            Cubre soporte técnico, servidor y consumo de tokens de IA.
            <strong className="text-[var(--color-t2)]"> No incluye nuevas funcionalidades</strong>.
            La cuota puede ajustarse cada 3 meses según el uso real.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="cw-mens">Cuota mensual</Label>
            <Input
              id="cw-mens"
              type="number"
              min="0"
              step="0.01"
              value={state.mantenimiento_mensual}
              onChange={(e) =>
                onChange({ mantenimiento_mensual: e.target.value })
              }
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="cw-mora">Mora %</Label>
            <Input
              id="cw-mora"
              type="number"
              min="0"
              step="0.1"
              value={state.mora_porcentaje}
              onChange={(e) => onChange({ mora_porcentaje: e.target.value })}
              placeholder="10"
            />
          </div>
          <div>
            <Label htmlFor="cw-gracia">Días de gracia</Label>
            <Input
              id="cw-gracia"
              type="number"
              min="0"
              step="1"
              value={state.dias_gracia}
              onChange={(e) => onChange({ dias_gracia: e.target.value })}
              placeholder="5"
            />
          </div>
          </div>
        </div>
      ) : null}

      {state.modalidad_pago === "custom" ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="mb-0">Etapas custom</Label>
            <button
              type="button"
              onClick={addCustomEtapa}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-info)] hover:brightness-125 transition-colors"
            >
              <Plus size={11} /> Agregar etapa
            </button>
          </div>
          <ul className="space-y-2">
            {state.detalle_pagos.length === 0 ? (
              <li className="text-[12px] text-[var(--color-t3)] italic px-2 py-2 rounded-[6px] border border-dashed border-[var(--color-b1)]">
                Agregá al menos una etapa para continuar.
              </li>
            ) : null}
            {state.detalle_pagos.map((d, idx) => (
              <li
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-[1fr_90px_110px_28px] gap-2 items-start"
              >
                <Input
                  value={d.etapa}
                  onChange={(e) =>
                    updateCustomEtapa(idx, { etapa: e.target.value })
                  }
                  placeholder="Etapa (ej. Inicio)"
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={d.porcentaje ?? ""}
                  onChange={(e) =>
                    updateCustomEtapa(idx, {
                      porcentaje: e.target.value
                        ? Number.parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="%"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.monto ?? ""}
                  onChange={(e) =>
                    updateCustomEtapa(idx, {
                      monto: e.target.value
                        ? Number.parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Monto"
                />
                <button
                  type="button"
                  onClick={() => removeCustomEtapa(idx)}
                  aria-label="Eliminar etapa"
                  className="h-9 w-9 rounded-[7px] flex items-center justify-center text-[var(--color-t3)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Resumen del split */}
      <SplitResumen
        moneda={state.moneda}
        detalle={
          state.modalidad_pago === "custom"
            ? state.detalle_pagos
            : computedDetalle
        }
      />
    </div>
  );
}

function SplitResumen({
  detalle,
  moneda,
}: {
  detalle: ContratoPagoDetalle[];
  moneda: string;
}) {
  if (detalle.length === 0) {
    return (
      <div className="text-[11.5px] text-[var(--color-t3)] italic">
        Resumen del split aparecerá al definir monto y modalidad.
      </div>
    );
  }
  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/60 p-3.5">
      <div className="text-[10.5px] font-semibold text-[var(--color-t3)] uppercase tracking-wider mb-2">
        Resumen del split
      </div>
      <ul className="space-y-1.5">
        {detalle.map((d, i) => (
          <li
            key={i}
            className="flex items-center gap-3 text-[12px]"
          >
            <span className="text-[var(--color-t1)] font-medium flex-1">
              {d.etapa || "(sin nombre)"}
            </span>
            {typeof d.porcentaje === "number" ? (
              <span className="text-[var(--color-t3)]">
                {d.porcentaje}%
              </span>
            ) : null}
            <span
              className="text-[var(--color-brand)] font-medium"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              {moneda}{" "}
              {typeof d.monto === "number"
                ? new Intl.NumberFormat("es-AR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  }).format(d.monto)
                : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
