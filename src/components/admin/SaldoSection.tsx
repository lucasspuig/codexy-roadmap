"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Dialog } from "@/components/admin/Dialog";
import {
  createPago,
  deletePago,
  listFinanzasByCliente,
  updatePago,
  uploadComprobante,
} from "@/app/(admin)/pagos/actions";
import { formatMonto, saldoDeCliente } from "@/lib/saldos";
import { cn, formatDate } from "@/lib/utils";
import {
  PAGO_METODO_LABELS,
  type Pago,
  type PagoMetodo,
} from "@/types/pagos";
import type { Contrato } from "@/types/contratos";

export interface SaldoSectionProps {
  clienteId: string;
  clienteNombre: string;
}

export function SaldoSection({ clienteId, clienteNombre }: SaldoSectionProps) {
  const router = useRouter();
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listFinanzasByCliente({ cliente_id: clienteId });
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setContratos([]);
        setPagos([]);
      } else {
        setContratos(res.data.contratos);
        setPagos(res.data.pagos);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  async function refresh() {
    const res = await listFinanzasByCliente({ cliente_id: clienteId });
    if (res.ok) {
      setContratos(res.data.contratos);
      setPagos(res.data.pagos);
    }
    router.refresh();
  }

  const saldo = useMemo(() => {
    if (!contratos || !pagos) return null;
    return saldoDeCliente(clienteId, contratos, pagos);
  }, [clienteId, contratos, pagos]);

  // Solo permite registrar pagos sobre contratos vivos
  const contratosFacturables = useMemo(
    () =>
      (contratos ?? []).filter(
        (c) => c.estado !== "borrador" && c.estado !== "cancelado",
      ),
    [contratos],
  );

  const editingPago = useMemo(
    () => (editingId ? pagos?.find((p) => p.id === editingId) ?? null : null),
    [editingId, pagos],
  );

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setConfirmLoading(true);
    const res = await deletePago({ id: confirmDelete });
    setConfirmLoading(false);
    setConfirmDelete(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pago eliminado");
    await refresh();
  }

  async function handleToggleVisible(pago: Pago) {
    const res = await updatePago({
      id: pago.id,
      patch: { visible_cliente: !pago.visible_cliente },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      pago.visible_cliente
        ? "Pago oculto para el cliente"
        : "Pago visible para el cliente",
    );
    await refresh();
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet size={14} className="text-[var(--color-info)]" />
        <h3 className="text-[13px] font-semibold text-[var(--color-t1)]">
          Saldos y pagos
        </h3>
        <button
          type="button"
          onClick={() => {
            if (contratosFacturables.length === 0) {
              toast.error(
                "Necesitás un contrato emitido o firmado para registrar pagos",
              );
              return;
            }
            setPagoOpen(true);
          }}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)] transition-all"
        >
          <Plus size={13} />
          Registrar pago
        </button>
      </div>
      <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
        Estado de cuenta de {clienteNombre}. El cliente lo ve en su vista
        pública (los pagos ocultos solo se ven acá).
      </p>

      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-[88px] rounded-[10px]" />
          <div className="skeleton h-[68px] rounded-[10px]" />
        </div>
      ) : !saldo || saldo.contratos.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--color-b1)] bg-[var(--color-s2)]/40 px-4 py-6 text-center">
          <CreditCard
            size={22}
            className="text-[var(--color-t3)] mx-auto mb-2 opacity-70"
            strokeWidth={1.5}
          />
          <p className="text-[13px] text-[var(--color-t2)] font-medium">
            Aún no hay contratos facturables
          </p>
          <p className="text-[11.5px] text-[var(--color-t3)] mt-1">
            Emití un contrato para empezar a registrar pagos.
          </p>
        </div>
      ) : (
        <>
          <SaldoHeader
            facturado={saldo.total_facturado}
            pagado={saldo.total_pagado}
            pendiente={saldo.pendiente}
            moneda={saldo.moneda}
          />
          <div className="mt-4 space-y-3">
            {saldo.contratos.map((cs) => (
              <ContratoSaldoRow
                key={cs.contrato_id}
                numero={cs.numero}
                titulo={cs.servicio_titulo}
                facturado={cs.monto_total}
                pagado={cs.total_pagado}
                pendiente={cs.pendiente}
                moneda={cs.moneda}
                pagos={cs.pagos}
                onEditPago={(id) => setEditingId(id)}
                onDeletePago={(id) => setConfirmDelete(id)}
                onToggleVisible={handleToggleVisible}
              />
            ))}
          </div>
        </>
      )}

      <PagoFormDialog
        open={pagoOpen}
        onClose={() => setPagoOpen(false)}
        contratos={contratosFacturables}
        onSaved={() => {
          setPagoOpen(false);
          void refresh();
        }}
      />

      <PagoFormDialog
        open={!!editingPago}
        onClose={() => setEditingId(null)}
        contratos={contratosFacturables}
        editing={editingPago}
        onSaved={() => {
          setEditingId(null);
          void refresh();
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={confirmLoading}
        title="¿Eliminar pago?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar pago"
      />
    </div>
  );
}

// ─── Header con totales ──────────────────────────────────────────────────────

function SaldoHeader({
  facturado,
  pagado,
  pendiente,
  moneda,
}: {
  facturado: number;
  pagado: number;
  pendiente: number;
  moneda: string;
}) {
  const pendienteCero = pendiente <= 0.005;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <KPI
        label="Facturado"
        value={formatMonto(facturado, moneda)}
        tone="neutral"
      />
      <KPI
        label="Pagado"
        value={formatMonto(pagado, moneda)}
        tone="success"
      />
      <KPI
        label={pendienteCero ? "Al día" : "Pendiente"}
        value={pendienteCero ? "—" : formatMonto(pendiente, moneda)}
        tone={pendienteCero ? "success" : "warn"}
      />
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warn";
}) {
  const palette =
    tone === "success"
      ? "border-[color-mix(in_srgb,var(--color-brand)_25%,var(--color-b1))] bg-[var(--color-brand-muted)] text-[var(--color-brand)]"
      : tone === "warn"
        ? "border-[rgba(251,191,36,0.30)] bg-[color-mix(in_srgb,#fbbf24_8%,transparent)] text-[var(--color-warn)]"
        : "border-[var(--color-b1)] bg-[var(--color-s2)]/40 text-[var(--color-t1)]";
  return (
    <div className={cn("rounded-[10px] border p-3.5", palette)}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div
        className="text-[18px] font-semibold mt-0.5"
        style={{ fontFamily: "var(--ff-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Detalle de un contrato + sus pagos ──────────────────────────────────────

function ContratoSaldoRow({
  numero,
  titulo,
  facturado,
  pagado,
  pendiente,
  moneda,
  pagos,
  onEditPago,
  onDeletePago,
  onToggleVisible,
}: {
  numero: string;
  titulo: string;
  facturado: number;
  pagado: number;
  pendiente: number;
  moneda: string;
  pagos: Pago[];
  onEditPago: (id: string) => void;
  onDeletePago: (id: string) => void;
  onToggleVisible: (p: Pago) => void;
}) {
  const pendienteCero = pendiente <= 0.005;
  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/40">
      <div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[var(--color-b1)] flex-wrap">
        <span
          className="text-[12.5px] font-semibold text-[var(--color-t1)]"
          style={{ fontFamily: "var(--ff-mono)" }}
        >
          {numero}
        </span>
        <span className="text-[12px] text-[var(--color-t2)] truncate min-w-0 flex-1">
          {titulo}
        </span>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-[var(--color-t3)]">
            Facturado{" "}
            <span
              className="text-[var(--color-t1)]"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              {formatMonto(facturado, moneda)}
            </span>
          </span>
          <span className="text-[var(--color-t3)]">·</span>
          <span className="text-[var(--color-brand)]">
            Pagado{" "}
            <span style={{ fontFamily: "var(--ff-mono)" }}>
              {formatMonto(pagado, moneda)}
            </span>
          </span>
          <span className="text-[var(--color-t3)]">·</span>
          <span
            className={cn(
              "font-medium",
              pendienteCero
                ? "text-[var(--color-brand)]"
                : "text-[var(--color-warn)]",
            )}
            style={{ fontFamily: "var(--ff-mono)" }}
          >
            {pendienteCero
              ? "Al día"
              : `Pendiente ${formatMonto(pendiente, moneda)}`}
          </span>
        </div>
      </div>
      {pagos.length === 0 ? (
        <div className="px-3.5 py-3 text-[11.5px] text-[var(--color-t3)] italic">
          Sin pagos registrados todavía.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-b1)]">
          {pagos.map((p) => (
            <li key={p.id} className="px-3.5 py-2 flex items-center gap-3 flex-wrap">
              <ArrowDownCircle
                size={13}
                className="text-[var(--color-brand)] shrink-0"
              />
              <span className="text-[11.5px] text-[var(--color-t2)] min-w-[88px]">
                {formatDate(p.fecha_pago)}
              </span>
              <span
                className="text-[12.5px] font-medium text-[var(--color-t1)] tabular-nums"
                style={{ fontFamily: "var(--ff-mono)" }}
              >
                {formatMonto(Number(p.monto), p.moneda)}
              </span>
              {p.metodo ? (
                <span className="text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--color-b1)] text-[var(--color-t3)]">
                  {PAGO_METODO_LABELS[p.metodo]}
                </span>
              ) : null}
              {p.etapa ? (
                <span className="text-[11px] text-[var(--color-t3)] truncate max-w-[200px]">
                  {p.etapa}
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-1">
                {p.comprobante_url ? (
                  <a
                    href={p.comprobante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ver comprobante"
                    className="h-7 w-7 rounded-[6px] border border-[var(--color-b1)] flex items-center justify-center text-[var(--color-t3)] hover:text-[var(--color-info)] hover:border-[var(--color-info-border)]"
                  >
                    <ExternalLink size={12} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => onToggleVisible(p)}
                  title={
                    p.visible_cliente
                      ? "Ocultar al cliente"
                      : "Mostrar al cliente"
                  }
                  className={cn(
                    "h-7 w-7 rounded-[6px] border flex items-center justify-center transition-colors",
                    p.visible_cliente
                      ? "border-[var(--color-b1)] text-[var(--color-t3)] hover:text-[var(--color-t1)]"
                      : "border-dashed border-[var(--color-b1)] text-[var(--color-t3)] hover:text-[var(--color-warn)]",
                  )}
                >
                  {p.visible_cliente ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => onEditPago(p.id)}
                  title="Editar pago"
                  className="h-7 w-7 rounded-[6px] border border-[var(--color-b1)] flex items-center justify-center text-[var(--color-t3)] hover:text-[var(--color-t1)]"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePago(p.id)}
                  title="Eliminar pago"
                  className="h-7 w-7 rounded-[6px] border border-[rgba(248,113,113,0.25)] flex items-center justify-center text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Form crear / editar pago ────────────────────────────────────────────────

function PagoFormDialog({
  open,
  onClose,
  contratos,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contratos: Contrato[];
  editing?: Pago | null;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [contratoId, setContratoId] = useState<string>("");
  const [fechaPago, setFechaPago] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [moneda, setMoneda] = useState<string>("USD");
  const [metodo, setMetodo] = useState<PagoMetodo | "">("");
  const [etapa, setEtapa] = useState<string>("");
  const [notas, setNotas] = useState<string>("");
  const [visibleCliente, setVisibleCliente] = useState<boolean>(true);
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (editing) {
      setContratoId(editing.contrato_id);
      setFechaPago(editing.fecha_pago);
      setMonto(String(editing.monto));
      setMoneda(editing.moneda);
      setMetodo(editing.metodo ?? "");
      setEtapa(editing.etapa ?? "");
      setNotas(editing.notas ?? "");
      setVisibleCliente(editing.visible_cliente);
      setComprobante(editing.comprobante_url);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setContratoId(contratos[0]?.id ?? "");
      setFechaPago(today);
      setMonto("");
      setMoneda(contratos[0]?.moneda ?? "USD");
      setMetodo("transferencia");
      setEtapa("");
      setNotas("");
      setVisibleCliente(true);
      setComprobante(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editing, contratos]);

  const selectedContrato = contratos.find((c) => c.id === contratoId);

  async function handleFile(file: File) {
    if (!contratoId) {
      toast.error("Elegí primero el contrato");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("contrato_id", contratoId);
    const res = await uploadComprobante(fd);
    setUploading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setComprobante(res.data.url);
    toast.success("Comprobante subido");
  }

  async function handleSubmit() {
    const m = Number.parseFloat(monto);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error("Monto inválido");
      return;
    }
    if (!contratoId) {
      toast.error("Elegí un contrato");
      return;
    }
    if (!fechaPago) {
      toast.error("Falta la fecha de pago");
      return;
    }
    setSubmitting(true);
    const payload = {
      contrato_id: contratoId,
      fecha_pago: fechaPago,
      monto: m,
      moneda,
      metodo: (metodo || null) as PagoMetodo | null,
      etapa: etapa.trim() || null,
      comprobante_url: comprobante,
      notas: notas.trim() || null,
      visible_cliente: visibleCliente,
    };
    const res = isEdit
      ? await updatePago({ id: editing!.id, patch: payload })
      : await createPago(payload);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(isEdit ? "Pago actualizado" : "Pago registrado");
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={isEdit ? "Editar pago" : "Registrar pago"}
      description={
        selectedContrato
          ? `${selectedContrato.numero} · ${selectedContrato.servicio_titulo}`
          : "Asociá el pago a un contrato"
      }
      maxWidth="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={uploading}
          >
            {isEdit ? "Guardar cambios" : "Registrar pago"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="ps-cont">Contrato</Label>
          <select
            id="ps-cont"
            value={contratoId}
            onChange={(e) => {
              setContratoId(e.target.value);
              const c = contratos.find((x) => x.id === e.target.value);
              if (c) setMoneda(c.moneda);
            }}
            disabled={isEdit}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)] disabled:opacity-60"
          >
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} — {c.servicio_titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ps-fecha">Fecha</Label>
            <Input
              id="ps-fecha"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ps-monto">Monto</Label>
            <Input
              id="ps-monto"
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ps-moneda">Moneda</Label>
            <select
              id="ps-moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ps-met">Método</Label>
            <select
              id="ps-met"
              value={metodo}
              onChange={(e) =>
                setMetodo(e.target.value as PagoMetodo | "")
              }
              className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
            >
              <option value="">—</option>
              {(Object.keys(PAGO_METODO_LABELS) as PagoMetodo[]).map((m) => (
                <option key={m} value={m}>
                  {PAGO_METODO_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="ps-etapa">Etapa / concepto (opcional)</Label>
          <Input
            id="ps-etapa"
            value={etapa}
            onChange={(e) => setEtapa(e.target.value)}
            placeholder="Ej. Inicio del proyecto, Mes 1, Mantenimiento marzo…"
          />
        </div>
        <div>
          <Label htmlFor="ps-comp">Comprobante (opcional)</Label>
          <div className="flex items-center gap-2">
            <input
              id="ps-comp"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="text-[12px] text-[var(--color-t2)] flex-1"
            />
            {comprobante ? (
              <a
                href={comprobante}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11.5px] text-[var(--color-info)] hover:brightness-125"
              >
                <ExternalLink size={11} /> Ver
              </a>
            ) : null}
          </div>
          {uploading ? (
            <p className="text-[11px] text-[var(--color-t3)] mt-1">
              Subiendo comprobante…
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="ps-notas">Notas (opcional)</Label>
          <Textarea
            id="ps-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Anotaciones internas o detalles del pago."
          />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-t2)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={visibleCliente}
            onChange={(e) => setVisibleCliente(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--color-brand)]"
          />
          Visible en la vista del cliente (recomendado)
        </label>
      </div>
    </Dialog>
  );
}
