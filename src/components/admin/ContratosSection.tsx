"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Printer,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/Dialog";
import { ContratoEditor } from "@/components/admin/ContratoEditor";
import { ContratoWizard } from "@/components/admin/ContratoWizard";
import {
  cancelarContrato,
  deleteContrato,
  emitirContrato,
  listContratosByCliente,
} from "@/app/(admin)/contratos/actions";
import { cn, formatDate } from "@/lib/utils";
import {
  TIPO_LABELS,
  type Contrato,
  type ContratoEstado,
  type ContratoTipo,
} from "@/types/contratos";

export interface ContratosSectionProps {
  clienteId: string;
  proyectoId?: string;
  clienteNombre: string;
  clienteEmpresa: string | null;
}

type ConfirmKind =
  | { kind: "delete"; id: string; numero: string }
  | { kind: "cancel"; id: string; numero: string }
  | { kind: "emit"; id: string; numero: string }
  | null;

export function ContratosSection({
  clienteId,
  proyectoId,
  clienteNombre,
  clienteEmpresa,
}: ContratosSectionProps) {
  const router = useRouter();
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listContratosByCliente({ cliente_id: clienteId });
      if (cancelled) return;
      if (!res.ok) {
        toast.error(res.error);
        setContratos([]);
      } else {
        setContratos(res.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId]);

  async function refresh() {
    const res = await listContratosByCliente({ cliente_id: clienteId });
    if (res.ok) setContratos(res.data);
  }

  function handleCreated() {
    setWizardOpen(false);
    void refresh();
  }

  function handleUpdated() {
    setEditingId(null);
    void refresh();
  }

  async function copyPublicLink(token: string) {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL ?? "";
    const url = `${base.replace(/\/$/, "")}/c/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de firma copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  function openPrint(id: string) {
    window.open(`/imprimir/${id}`, "_blank", "noopener,noreferrer");
  }

  async function executeConfirm() {
    if (!confirm) return;
    setConfirmLoading(true);
    try {
      if (confirm.kind === "delete") {
        const res = await deleteContrato({ id: confirm.id });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Contrato eliminado");
      } else if (confirm.kind === "cancel") {
        const res = await cancelarContrato({ id: confirm.id });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Contrato cancelado");
      } else if (confirm.kind === "emit") {
        const res = await emitirContrato({ id: confirm.id });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Contrato emitido y listo para firmar");
        // Copiar link automáticamente
        void copyPublicLink(res.data.token);
      }
      await refresh();
      router.refresh();
    } finally {
      setConfirmLoading(false);
      setConfirm(null);
    }
  }

  const ordered = useMemo(() => contratos ?? [], [contratos]);

  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={14} className="text-[var(--color-info)]" />
        <h3 className="text-[13px] font-semibold text-[var(--color-t1)]">
          Contratos
        </h3>
        <span className="text-[11px] text-[var(--color-t3)] ml-1">
          {ordered.length > 0 ? `(${ordered.length})` : ""}
        </span>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)] transition-all"
        >
          <Plus size={13} />
          Nuevo contrato
        </button>
      </div>
      <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
        Implementación, mantenimiento o el combo de ambos. El cliente firma online y queda inmutable.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-[68px] rounded-[10px]" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--color-b1)] bg-[var(--color-s2)]/40 px-4 py-6 text-center">
          <FileText
            size={22}
            className="text-[var(--color-t3)] mx-auto mb-2 opacity-70"
            strokeWidth={1.5}
          />
          <p className="text-[13px] text-[var(--color-t2)] font-medium">
            Aún no hay contratos
          </p>
          <p className="text-[11.5px] text-[var(--color-t3)] mt-1">
            Generá el primero para este cliente.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            onClick={() => setWizardOpen(true)}
          >
            <Plus size={13} />
            Crear contrato
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {ordered.map((c) => (
            <ContratoRow
              key={c.id}
              contrato={c}
              onEdit={() => setEditingId(c.id)}
              onEmit={() =>
                setConfirm({ kind: "emit", id: c.id, numero: c.numero })
              }
              onDelete={() =>
                setConfirm({ kind: "delete", id: c.id, numero: c.numero })
              }
              onCancel={() =>
                setConfirm({ kind: "cancel", id: c.id, numero: c.numero })
              }
              onCopyLink={() => c.token_publico && copyPublicLink(c.token_publico)}
              onPrint={() => openPrint(c.id)}
            />
          ))}
        </ul>
      )}

      <ContratoWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        clienteId={clienteId}
        proyectoId={proyectoId}
        clienteNombre={clienteNombre}
        clienteEmpresa={clienteEmpresa}
        onCreated={handleCreated}
      />

      {editingId ? (
        <ContratoEditor
          open={!!editingId}
          onClose={() => setEditingId(null)}
          contratoId={editingId}
          onSaved={handleUpdated}
        />
      ) : null}

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={executeConfirm}
        loading={confirmLoading}
        title="¿Eliminar contrato?"
        description={
          confirm?.kind === "delete"
            ? `Se eliminará el contrato ${confirm.numero}. Solo podés borrar borradores.`
            : ""
        }
        confirmLabel="Eliminar"
      />

      <ConfirmDialog
        open={confirm?.kind === "cancel"}
        onClose={() => setConfirm(null)}
        onConfirm={executeConfirm}
        loading={confirmLoading}
        title="¿Cancelar contrato?"
        description={
          confirm?.kind === "cancel"
            ? `Se marcará ${confirm.numero} como cancelado. El link de firma dejará de funcionar.`
            : ""
        }
        confirmLabel="Cancelar contrato"
      />

      <ConfirmDialog
        open={confirm?.kind === "emit"}
        onClose={() => setConfirm(null)}
        onConfirm={executeConfirm}
        loading={confirmLoading}
        title="¿Emitir este contrato?"
        description={
          confirm?.kind === "emit"
            ? `Una vez emitido (${confirm.numero}) el contenido queda bloqueado. Codexy firmará automáticamente y se generará el link público para el cliente.`
            : ""
        }
        confirmLabel="Emitir contrato"
        variant="primary"
      />
    </div>
  );
}

// ─── Sub-component: fila de contrato ─────────────────────────────────────────

function ContratoRow({
  contrato,
  onEdit,
  onEmit,
  onDelete,
  onCancel,
  onCopyLink,
  onPrint,
}: {
  contrato: Contrato;
  onEdit: () => void;
  onEmit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onCopyLink: () => void;
  onPrint: () => void;
}) {
  const isBorrador = contrato.estado === "borrador";
  const isEnviado = contrato.estado === "enviado";
  const isFirmado = contrato.estado === "firmado_completo";
  const isCancelado = contrato.estado === "cancelado";

  return (
    <li className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s2)]/40 hover:bg-[var(--color-s2)] hover:border-[var(--color-b2)] transition-colors p-3.5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[12.5px] font-semibold text-[var(--color-t1)]"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              {contrato.numero}
            </span>
            <TipoBadge tipo={contrato.tipo} />
            <EstadoBadge estado={contrato.estado} />
          </div>
          <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11.5px] text-[var(--color-t3)]">
            <span
              className="text-[var(--color-t2)] font-medium"
              style={{ fontFamily: "var(--ff-mono)" }}
            >
              {formatMonto(contrato.monto_total, contrato.moneda)}
            </span>
            <span>·</span>
            <span>{formatDate(contrato.created_at)}</span>
            {contrato.fecha_firmado_completo ? (
              <>
                <span>·</span>
                <span className="text-[var(--color-brand)]">
                  Firmado {formatDate(contrato.fecha_firmado_completo)}
                </span>
              </>
            ) : null}
          </div>
          {contrato.servicio_titulo ? (
            <p className="mt-1 text-[12px] text-[var(--color-t2)] truncate">
              {contrato.servicio_titulo}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {isBorrador ? (
            <>
              <IconButton onClick={onPrint} title="Vista previa del contrato">
                <Eye size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Ver</span>
              </IconButton>
              <IconButton onClick={onEdit} title="Editar borrador">
                <Pencil size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Editar</span>
              </IconButton>
              <IconButton onClick={onEmit} variant="primary" title="Emitir contrato">
                <Send size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Emitir</span>
              </IconButton>
              <IconButton
                onClick={onDelete}
                variant="danger"
                title="Eliminar borrador"
                aria-label="Eliminar"
              >
                <Trash2 size={12.5} />
              </IconButton>
            </>
          ) : isEnviado ? (
            <>
              <IconButton onClick={onPrint} title="Ver contrato">
                <Eye size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Ver</span>
              </IconButton>
              <IconButton onClick={onCopyLink} title="Copiar link público">
                <Copy size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Link firma</span>
              </IconButton>
              <IconButton
                onClick={onCancel}
                variant="danger"
                title="Cancelar contrato"
                aria-label="Cancelar"
              >
                <XCircle size={12.5} />
              </IconButton>
            </>
          ) : isFirmado ? (
            <>
              <IconButton onClick={onPrint} title="Ver contrato firmado">
                <Eye size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">Ver</span>
              </IconButton>
              <IconButton onClick={onPrint} title="Imprimir / PDF">
                <Printer size={12.5} />
                <span className="sr-only sm:not-sr-only sm:ml-1.5">PDF</span>
              </IconButton>
            </>
          ) : isCancelado ? (
            <IconButton onClick={onPrint} title="Ver">
              <ExternalLink size={12.5} />
              <span className="sr-only sm:not-sr-only sm:ml-1.5">Ver</span>
            </IconButton>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function IconButton({
  children,
  onClick,
  title,
  variant = "default",
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  variant?: "default" | "primary" | "danger";
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center h-7 px-2 text-[11.5px] font-medium rounded-[6px] border transition-colors",
        variant === "primary" &&
          "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)] hover:brightness-110",
        variant === "danger" &&
          "border-[rgba(248,113,113,0.25)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] hover:border-[rgba(248,113,113,0.45)]",
        variant === "default" &&
          "border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)]",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function TipoBadge({ tipo }: { tipo: ContratoTipo }) {
  const label =
    tipo === "implementacion_y_mantenimiento"
      ? "Implementación + Mantenimiento"
      : TIPO_LABELS[tipo];
  const cls =
    tipo === "implementacion"
      ? "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]"
      : tipo === "mantenimiento"
        ? "bg-[var(--color-info-muted)] border-[var(--color-info-border)] text-[var(--color-info)]"
        : // combo
          "bg-[color-mix(in_srgb,var(--color-brand)_18%,var(--color-info-muted))] border-[var(--color-brand-border)] text-[var(--color-brand)]";
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: ContratoEstado }) {
  const map: Record<
    ContratoEstado,
    { label: string; bg: string; border: string; text: string }
  > = {
    borrador: {
      label: "Borrador",
      bg: "var(--color-s3)",
      border: "var(--color-b1)",
      text: "var(--color-t3)",
    },
    enviado: {
      label: "Esperando firma",
      bg: "var(--color-info-muted)",
      border: "var(--color-info-border)",
      text: "var(--color-info)",
    },
    firmado_cliente: {
      label: "Firmado cliente",
      bg: "rgba(251,191,36,0.10)",
      border: "rgba(251,191,36,0.30)",
      text: "var(--color-warn)",
    },
    firmado_completo: {
      label: "Firmado",
      bg: "var(--color-brand-muted)",
      border: "var(--color-brand-border)",
      text: "var(--color-brand)",
    },
    cancelado: {
      label: "Cancelado",
      bg: "var(--color-danger-muted)",
      border: "rgba(248,113,113,0.30)",
      text: "var(--color-danger)",
    },
  };
  const meta = map[estado];
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
      style={{
        backgroundColor: meta.bg,
        borderColor: meta.border,
        color: meta.text,
      }}
    >
      {meta.label}
    </span>
  );
}

function formatMonto(monto: number, moneda: string): string {
  const sym = moneda === "ARS" ? "$" : moneda === "USD" ? "USD" : moneda;
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(monto);
  return `${sym} ${formatted}`;
}
