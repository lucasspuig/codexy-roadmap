"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  PhoneOff,
  Plus,
  Send,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Dialog } from "@/components/admin/Dialog";
import { NuevoCobroMensualDialog } from "@/components/admin/NuevoCobroMensualDialog";
import {
  cancelarCuota,
  forzarRecordatorio,
  marcarCuotaPagada,
} from "@/app/(admin)/cobros/actions";
import {
  formatARS,
  formatFechaCorta,
  formatUSD,
} from "@/lib/cuotas";
import type { CotizacionDolar } from "@/lib/cambio";
import {
  PAGO_METODO_LABELS,
  type PagoMetodo,
} from "@/types/pagos";
import type { CuotaEstado } from "@/types/cobros";
import { cn } from "@/lib/utils";

export interface CobrosCuotaData {
  id: string;
  contrato_id: string;
  cliente_id: string;
  periodo: string;
  fecha_recordatorio_1: string;
  fecha_recordatorio_2: string;
  fecha_vencimiento: string;
  fecha_escalacion: string;
  monto_usd: number;
  estado: CuotaEstado;
  es_trimestral: boolean;
  meses_cubiertos: number;
  pago_id: string | null;
  pagada_at: string | null;
  recordatorio_1_enviado_at: string | null;
  recordatorio_2_enviado_at: string | null;
  cliente: {
    id: string;
    nombre: string;
    empresa: string | null;
    telefono: string | null;
    tipo: string | null;
  };
  contrato: {
    numero: string;
    servicio_titulo: string;
    moneda: string;
  };
}

export interface CobrosClientProps {
  cuotas: CobrosCuotaData[];
  loadError: string | null;
  evolutionConfigurada: boolean;
}

const ESTADO_LABELS: Record<CuotaEstado, string> = {
  pendiente: "Pendiente",
  recordada_1: "Recordatorio 1",
  recordada_2: "Recordatorio 2",
  pagada: "Pagada",
  escalada: "Escalada",
  cancelada: "Cancelada",
};

export function CobrosClient({
  cuotas,
  loadError,
  evolutionConfigurada,
}: CobrosClientProps) {
  const router = useRouter();
  const [cotizacion, setCotizacion] = useState<CotizacionDolar | null>(null);
  const [pagarDialog, setPagarDialog] = useState<CobrosCuotaData | null>(null);
  const [cancelarDialog, setCancelarDialog] = useState<CobrosCuotaData | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nuevoCobroOpen, setNuevoCobroOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dolar", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setCotizacion(data as CotizacionDolar);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const tcOficial = cotizacion?.promedio ?? null;

  // KPIs del mes corriente
  const kpis = useMemo(() => {
    const now = new Date();
    const periodoActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let pendienteEsteMes = 0;
    let proximas = 0;
    let totalACobrar = 0;
    let cobradasEsteMes = 0;
    for (const c of cuotas) {
      if (c.estado === "cancelada") continue;
      if (c.estado === "pagada") {
        if (c.periodo === periodoActual) cobradasEsteMes += 1;
        continue;
      }
      totalACobrar += c.monto_usd;
      if (c.periodo === periodoActual) pendienteEsteMes += 1;
      else proximas += 1;
    }
    return { pendienteEsteMes, proximas, totalACobrar, cobradasEsteMes };
  }, [cuotas]);

  // Agrupación por bucket: atrasadas / esta semana / próxima semana / mes / más adelante
  const grupos = useMemo(() => groupByWeek(cuotas), [cuotas]);

  async function handleForzar(cuota: CobrosCuotaData, tipo: "recordatorio_1" | "recordatorio_2") {
    if (!evolutionConfigurada) {
      toast.error("Evolution API no está configurada — no se puede mandar WhatsApp.");
      return;
    }
    if (!cuota.cliente.telefono) {
      toast.error("El cliente no tiene teléfono cargado.");
      return;
    }
    setBusyId(cuota.id);
    const res = await forzarRecordatorio({ cuota_id: cuota.id, tipo });
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      tipo === "recordatorio_1"
        ? "Recordatorio 1 enviado"
        : "Recordatorio 2 enviado",
    );
    router.refresh();
  }

  async function handleConfirmarCancelar() {
    if (!cancelarDialog) return;
    setBusyId(cancelarDialog.id);
    const res = await cancelarCuota({ cuota_id: cancelarDialog.id });
    setBusyId(null);
    setCancelarDialog(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cuota cancelada");
    router.refresh();
  }

  return (
    <div className="px-4 sm:px-6 lg:px-7 py-6 max-w-[1300px] mx-auto w-full">
      <div className="flex items-start gap-2 mb-1 justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-[var(--color-info)]" />
          <h1 className="text-[20px] font-semibold text-[var(--color-t1)] tracking-[-0.01em]">
            Cobros
          </h1>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setNuevoCobroOpen(true)}
        >
          <Plus size={13} />
          Nuevo cobro mensual
        </Button>
      </div>
      <p className="text-[13px] text-[var(--color-t3)] mb-5 leading-relaxed">
        Calendario de cuotas mensuales. Atrasadas primero, después esta semana
        y las próximas. Los recordatorios automáticos se mandan vía cron — acá
        podés forzarlos, marcar pagos manuales o cancelar cuotas.
      </p>

      {!evolutionConfigurada ? (
        <div className="mb-4 rounded-[10px] border border-[rgba(251,191,36,0.30)] bg-[color-mix(in_srgb,#fbbf24_8%,transparent)] px-3.5 py-2.5 text-[12px] text-[var(--color-warn)] leading-relaxed flex items-start gap-2">
          <PhoneOff size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Evolution API no configurada.</strong> Definí las variables{" "}
            <code className="text-[11.5px]">EVOLUTION_API_URL</code>,{" "}
            <code className="text-[11.5px]">EVOLUTION_API_KEY</code> y{" "}
            <code className="text-[11.5px]">EVOLUTION_INSTANCE</code> para
            poder mandar recordatorios.
          </span>
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-4 rounded-[10px] border border-[rgba(248,113,113,0.30)] bg-[var(--color-danger-muted)] px-3.5 py-2.5 text-[12px] text-[var(--color-danger)]">
          Error cargando cuotas: {loadError}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <KpiCard
          label="Pendientes este mes"
          value={String(kpis.pendienteEsteMes)}
          icon={<Clock size={13} />}
          tone="warn"
        />
        <KpiCard
          label="Próximas"
          value={String(kpis.proximas)}
          icon={<CalendarDays size={13} />}
          tone="info"
        />
        <KpiCard
          label="Total a cobrar"
          value={`USD ${formatUSD(kpis.totalACobrar)}`}
          icon={<Wallet size={13} />}
          tone="neutral"
          mono
        />
        <KpiCard
          label="Cobradas este mes"
          value={String(kpis.cobradasEsteMes)}
          icon={<CheckCircle2 size={13} />}
          tone="success"
        />
      </div>

      {/* Listas por grupo */}
      <div className="space-y-5">
        {grupos.atrasadas.length > 0 ? (
          <Bucket
            title="Atrasadas"
            tone="danger"
            count={grupos.atrasadas.length}
            cuotas={grupos.atrasadas}
            tcOficial={tcOficial}
            busyId={busyId}
            evolutionConfigurada={evolutionConfigurada}
            onForzar={handleForzar}
            onPagar={(c) => setPagarDialog(c)}
            onCancelar={(c) => setCancelarDialog(c)}
          />
        ) : null}
        <Bucket
          title="Esta semana"
          tone="warn"
          count={grupos.estaSemana.length}
          cuotas={grupos.estaSemana}
          tcOficial={tcOficial}
          busyId={busyId}
          evolutionConfigurada={evolutionConfigurada}
          onForzar={handleForzar}
          onPagar={(c) => setPagarDialog(c)}
          onCancelar={(c) => setCancelarDialog(c)}
        />
        <Bucket
          title="Próxima semana"
          tone="info"
          count={grupos.proximaSemana.length}
          cuotas={grupos.proximaSemana}
          tcOficial={tcOficial}
          busyId={busyId}
          evolutionConfigurada={evolutionConfigurada}
          onForzar={handleForzar}
          onPagar={(c) => setPagarDialog(c)}
          onCancelar={(c) => setCancelarDialog(c)}
        />
        <Bucket
          title="Resto del mes y siguientes"
          tone="neutral"
          count={grupos.resto.length}
          cuotas={grupos.resto}
          tcOficial={tcOficial}
          busyId={busyId}
          evolutionConfigurada={evolutionConfigurada}
          onForzar={handleForzar}
          onPagar={(c) => setPagarDialog(c)}
          onCancelar={(c) => setCancelarDialog(c)}
        />
        {grupos.cerradas.length > 0 ? (
          <Bucket
            title="Cerradas (pagadas / canceladas)"
            tone="success"
            count={grupos.cerradas.length}
            cuotas={grupos.cerradas}
            tcOficial={tcOficial}
            busyId={busyId}
            evolutionConfigurada={evolutionConfigurada}
            onForzar={handleForzar}
            onPagar={(c) => setPagarDialog(c)}
            onCancelar={(c) => setCancelarDialog(c)}
            collapsedByDefault
          />
        ) : null}
      </div>

      <PagarDialog
        open={!!pagarDialog}
        cuota={pagarDialog}
        tcOficial={tcOficial}
        onClose={() => setPagarDialog(null)}
        onSaved={() => {
          setPagarDialog(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={!!cancelarDialog}
        onClose={() => setCancelarDialog(null)}
        onConfirm={handleConfirmarCancelar}
        title="¿Cancelar cuota?"
        description={
          cancelarDialog
            ? `Cuota ${cancelarDialog.periodo} de ${cancelarDialog.cliente.nombre}. Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Cancelar cuota"
        loading={busyId === cancelarDialog?.id}
      />

      <NuevoCobroMensualDialog
        open={nuevoCobroOpen}
        onClose={() => setNuevoCobroOpen(false)}
        onCreated={() => {
          setNuevoCobroOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// ─── Bucket ──────────────────────────────────────────────────────────────────

function Bucket({
  title,
  tone,
  count,
  cuotas,
  tcOficial,
  busyId,
  evolutionConfigurada,
  onForzar,
  onPagar,
  onCancelar,
  collapsedByDefault = false,
}: {
  title: string;
  tone: "danger" | "warn" | "info" | "neutral" | "success";
  count: number;
  cuotas: CobrosCuotaData[];
  tcOficial: number | null;
  busyId: string | null;
  evolutionConfigurada: boolean;
  onForzar: (c: CobrosCuotaData, tipo: "recordatorio_1" | "recordatorio_2") => void;
  onPagar: (c: CobrosCuotaData) => void;
  onCancelar: (c: CobrosCuotaData) => void;
  collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  if (count === 0 && tone !== "warn" && tone !== "info" && tone !== "neutral") {
    return null;
  }
  const palette =
    tone === "danger"
      ? "text-[var(--color-danger)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : tone === "info"
          ? "text-[var(--color-info)]"
          : tone === "success"
            ? "text-[var(--color-brand)]"
            : "text-[var(--color-t2)]";
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <span
          className={cn(
            "text-[12.5px] font-semibold uppercase tracking-wider",
            palette,
          )}
        >
          {title}
        </span>
        <span className="text-[11px] text-[var(--color-t3)]">
          ({count})
        </span>
        <span className="ml-auto text-[11px] text-[var(--color-t3)] group-hover:text-[var(--color-t2)]">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>
      {open ? (
        count === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[var(--color-b1)] px-4 py-3 text-[12px] text-[var(--color-t3)] italic">
            Sin cuotas en este rango.
          </div>
        ) : (
          <ul className="space-y-2">
            {cuotas.map((c) => (
              <li key={c.id}>
                <CuotaRow
                  cuota={c}
                  tcOficial={tcOficial}
                  busy={busyId === c.id}
                  evolutionConfigurada={evolutionConfigurada}
                  onForzar={onForzar}
                  onPagar={onPagar}
                  onCancelar={onCancelar}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

// ─── Row de cuota ────────────────────────────────────────────────────────────

function CuotaRow({
  cuota,
  tcOficial,
  busy,
  evolutionConfigurada,
  onForzar,
  onPagar,
  onCancelar,
}: {
  cuota: CobrosCuotaData;
  tcOficial: number | null;
  busy: boolean;
  evolutionConfigurada: boolean;
  onForzar: (c: CobrosCuotaData, tipo: "recordatorio_1" | "recordatorio_2") => void;
  onPagar: (c: CobrosCuotaData) => void;
  onCancelar: (c: CobrosCuotaData) => void;
}) {
  const ars = tcOficial && tcOficial > 0 ? cuota.monto_usd * tcOficial : null;
  const cerrada = cuota.estado === "pagada" || cuota.estado === "cancelada";
  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] px-3.5 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="text-[13px] font-medium text-[var(--color-t1)] truncate flex items-center gap-1.5">
            <span className="truncate">
              {cuota.cliente.nombre}
              {cuota.cliente.empresa ? (
                <span className="text-[var(--color-t3)] font-normal">
                  {" "}· {cuota.cliente.empresa}
                </span>
              ) : null}
            </span>
            {cuota.cliente.tipo === "cobro_directo" ? (
              <span
                className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-[var(--color-info-border)] bg-[var(--color-info-muted)] text-[var(--color-info)] font-medium shrink-0"
                title="Cliente creado directamente desde Cobros (no pasó por el CRM)"
              >
                <Zap size={9} />
                Directo
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-[var(--color-t3)] mt-0.5 truncate">
            <span style={{ fontFamily: "var(--ff-mono)" }}>
              {cuota.contrato.numero}
            </span>
            {" · "}
            <span>Cuota {cuota.periodo}</span>
            {cuota.es_trimestral ? (
              <span className="ml-1 text-[var(--color-info)]">
                (trimestral, {cuota.meses_cubiertos} meses)
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end min-w-[120px]">
          <span
            className="text-[14px] font-semibold text-[var(--color-t1)] tabular-nums"
            style={{ fontFamily: "var(--ff-mono)" }}
          >
            USD {formatUSD(cuota.monto_usd)}
          </span>
          {ars !== null ? (
            <span
              className="text-[10.5px] text-[var(--color-t3)] tabular-nums"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              ≈ ARS {formatARS(ars)}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col items-end min-w-[110px]">
          <span className="text-[11px] text-[var(--color-t3)]">
            Vence
          </span>
          <span className="text-[12px] text-[var(--color-t1)]">
            {formatFechaCorta(cuota.fecha_vencimiento)}
          </span>
        </div>

        <EstadoBadge estado={cuota.estado} />
      </div>

      {!cerrada ? (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <ActionButton
            disabled={busy || !evolutionConfigurada || !cuota.cliente.telefono}
            onClick={() => onForzar(cuota, "recordatorio_1")}
            icon={<Bell size={12} />}
            label="Forzar Rec. 1"
          />
          <ActionButton
            disabled={busy || !evolutionConfigurada || !cuota.cliente.telefono}
            onClick={() => onForzar(cuota, "recordatorio_2")}
            icon={<Send size={12} />}
            label="Forzar Rec. 2"
          />
          <ActionButton
            disabled={busy}
            onClick={() => onPagar(cuota)}
            icon={<CheckCircle2 size={12} />}
            label="Marcar pagada"
            tone="success"
          />
          <ActionButton
            disabled={busy}
            onClick={() => onCancelar(cuota)}
            icon={<XCircle size={12} />}
            label="Cancelar"
            tone="danger"
          />
          {busy ? (
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-[var(--color-t3)]">
              <Loader2 size={11} className="animate-spin" /> procesando…
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "success" | "danger";
}) {
  const palette =
    tone === "success"
      ? "border-[color-mix(in_srgb,var(--color-brand)_30%,var(--color-b1))] text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)]"
      : tone === "danger"
        ? "border-[rgba(248,113,113,0.25)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
        : "border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-info-border)] hover:text-[var(--color-info)] hover:bg-[var(--color-info-muted)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[6px] border transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        palette,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EstadoBadge({ estado }: { estado: CuotaEstado }) {
  const palette: Record<CuotaEstado, string> = {
    pendiente:
      "border-[var(--color-b1)] text-[var(--color-t3)] bg-[var(--color-s2)]",
    recordada_1:
      "border-[var(--color-info-border)] text-[var(--color-info)] bg-[var(--color-info-muted)]",
    recordada_2:
      "border-[rgba(251,191,36,0.30)] text-[var(--color-warn)] bg-[color-mix(in_srgb,#fbbf24_8%,transparent)]",
    escalada:
      "border-[rgba(248,113,113,0.30)] text-[var(--color-danger)] bg-[var(--color-danger-muted)]",
    pagada:
      "border-[color-mix(in_srgb,var(--color-brand)_30%,transparent)] text-[var(--color-brand)] bg-[var(--color-brand-muted)]",
    cancelada:
      "border-[var(--color-b1)] text-[var(--color-t3)] bg-[var(--color-s2)] line-through",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-medium",
        palette[estado],
      )}
    >
      {ESTADO_LABELS[estado]}
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
  mono,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "neutral" | "success" | "warn" | "info";
  mono?: boolean;
}) {
  const palette =
    tone === "success"
      ? "border-[color-mix(in_srgb,var(--color-brand)_25%,var(--color-b1))] bg-[var(--color-brand-muted)] text-[var(--color-brand)]"
      : tone === "warn"
        ? "border-[rgba(251,191,36,0.30)] bg-[color-mix(in_srgb,#fbbf24_8%,transparent)] text-[var(--color-warn)]"
        : tone === "info"
          ? "border-[var(--color-info-border)] bg-[var(--color-info-muted)] text-[var(--color-info)]"
          : "border-[var(--color-b1)] bg-[var(--color-s1)] text-[var(--color-t1)]";
  return (
    <div className={cn("rounded-[10px] border p-3", palette)}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div
        className="text-[18px] font-semibold mt-0.5"
        style={{ fontFamily: mono ? "var(--ff-mono)" : "inherit" }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Pagar dialog (registrar pago manual) ────────────────────────────────────

function PagarDialog({
  open,
  cuota,
  tcOficial,
  onClose,
  onSaved,
}: {
  open: boolean;
  cuota: CobrosCuotaData | null;
  tcOficial: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [montoReal, setMontoReal] = useState("");
  const [moneda, setMoneda] = useState<"USD" | "ARS">("USD");
  const [tcAplicado, setTcAplicado] = useState("");
  const [metodo, setMetodo] = useState<PagoMetodo>("transferencia");
  const [fechaPago, setFechaPago] = useState("");
  const [comprobanteUrl, setComprobanteUrl] = useState("");
  const [notas, setNotas] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !cuota) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setMontoReal(String(cuota.monto_usd));
    setMoneda(cuota.contrato.moneda === "ARS" ? "ARS" : "USD");
    setTcAplicado(tcOficial && tcOficial > 0 ? String(tcOficial) : "");
    setMetodo("transferencia");
    setFechaPago(new Date().toISOString().slice(0, 10));
    setComprobanteUrl("");
    setNotas("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, cuota, tcOficial]);

  if (!cuota) return null;

  const requiereTC = moneda === "ARS";

  async function handleSubmit() {
    if (!cuota) return;
    const m = Number.parseFloat(montoReal);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!fechaPago) {
      toast.error("Falta la fecha de pago");
      return;
    }
    let tc: number | null = null;
    if (requiereTC) {
      const parsed = Number.parseFloat(tcAplicado);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error("Cargá el tipo de cambio aplicado");
        return;
      }
      tc = parsed;
    }
    setSubmitting(true);
    const res = await marcarCuotaPagada({
      cuota_id: cuota.id,
      monto_real: m,
      moneda,
      tipo_cambio_aplicado: tc,
      metodo,
      fecha_pago: fechaPago,
      comprobante_url: comprobanteUrl.trim() || null,
      notas: notas.trim() || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cuota marcada como pagada");
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Marcar cuota como pagada"
      description={`${cuota.cliente.nombre} · Cuota ${cuota.periodo}`}
      maxWidth="520px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
          >
            <CreditCard size={13} />
            Registrar pago
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/40 p-3 text-[12px] text-[var(--color-t2)]">
          <div className="flex items-center justify-between">
            <span>Monto cuota</span>
            <span
              className="font-semibold text-[var(--color-t1)]"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              USD {formatUSD(cuota.monto_usd)}
            </span>
          </div>
          {tcOficial && tcOficial > 0 ? (
            <div className="flex items-center justify-between mt-1 text-[var(--color-t3)]">
              <span>Equivalente ARS (BNA)</span>
              <span style={{ fontFamily: "var(--ff-mono)" }}>
                ARS {formatARS(cuota.monto_usd * tcOficial)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cb-fecha">Fecha de pago</Label>
            <Input
              id="cb-fecha"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cb-met">Método</Label>
            <select
              id="cb-met"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as PagoMetodo)}
              className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
            >
              {(Object.keys(PAGO_METODO_LABELS) as PagoMetodo[]).map((m) => (
                <option key={m} value={m}>
                  {PAGO_METODO_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cb-monto">Monto real cobrado</Label>
            <Input
              id="cb-monto"
              type="number"
              min="0"
              step="0.01"
              value={montoReal}
              onChange={(e) => setMontoReal(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cb-mon">Moneda</Label>
            <select
              id="cb-mon"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as "USD" | "ARS")}
              className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
        </div>

        {requiereTC ? (
          <div>
            <Label htmlFor="cb-tc">Tipo de cambio aplicado (1 USD = ARS)</Label>
            <Input
              id="cb-tc"
              type="number"
              min="0"
              step="0.01"
              value={tcAplicado}
              onChange={(e) => setTcAplicado(e.target.value)}
              placeholder={tcOficial ? String(tcOficial) : "1350"}
            />
            <p className="text-[11px] text-[var(--color-t3)] mt-1">
              Necesario porque cobraste en ARS y el contrato es en USD.
            </p>
          </div>
        ) : null}

        <div>
          <Label htmlFor="cb-comp">URL del comprobante (opcional)</Label>
          <Input
            id="cb-comp"
            type="url"
            value={comprobanteUrl}
            onChange={(e) => setComprobanteUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div>
          <Label htmlFor="cb-notas">Notas (opcional)</Label>
          <Textarea
            id="cb-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Detalles del pago para el equipo."
          />
        </div>

        <div className="text-[11.5px] text-[var(--color-t3)] flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Esto crea un row en <code className="text-[10.5px]">pagos</code> y
            marca la cuota como pagada. Si después necesitás revertirlo, borrá
            el pago desde la pestaña de saldos del cliente.
          </span>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Agrupado por bucket de fecha ────────────────────────────────────────────

interface Grupos {
  atrasadas: CobrosCuotaData[];
  estaSemana: CobrosCuotaData[];
  proximaSemana: CobrosCuotaData[];
  resto: CobrosCuotaData[];
  cerradas: CobrosCuotaData[];
}

function groupByWeek(cuotas: CobrosCuotaData[]): Grupos {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Inicio de la semana actual (lunes)
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(today.getDate() + offsetToMonday);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const startNextWeek = new Date(endOfWeek);
  startNextWeek.setDate(endOfWeek.getDate() + 1);
  const endNextWeek = new Date(startNextWeek);
  endNextWeek.setDate(startNextWeek.getDate() + 6);

  const grupos: Grupos = {
    atrasadas: [],
    estaSemana: [],
    proximaSemana: [],
    resto: [],
    cerradas: [],
  };

  for (const c of cuotas) {
    if (c.estado === "pagada" || c.estado === "cancelada") {
      grupos.cerradas.push(c);
      continue;
    }
    const venc = parseDate(c.fecha_vencimiento);
    if (!venc) {
      grupos.resto.push(c);
      continue;
    }
    if (venc < today) {
      grupos.atrasadas.push(c);
    } else if (venc <= endOfWeek) {
      grupos.estaSemana.push(c);
    } else if (venc <= endNextWeek) {
      grupos.proximaSemana.push(c);
    } else {
      grupos.resto.push(c);
    }
  }
  return grupos;
}

function parseDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}
