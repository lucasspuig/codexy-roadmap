"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Building2,
  Circle,
  Link2,
  Check,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ProgressBar } from "@/components/admin/ProgressBar";
import { cn, getPublicUrl, relativeTime } from "@/lib/utils";
import type { ProyectoEstado } from "@/types/database";

export interface ClientCardData {
  id: string;
  nombre: string;
  empresa: string | null;
  rubro: string | null;
  proyecto: {
    id: string;
    nombre: string;
    estado: ProyectoEstado;
    updated_at: string;
    fases_total: number;
    fases_done: number;
    fases_active: number;
    publicToken: string | null;
  } | null;
}

const estadoColors: Record<
  ProyectoEstado,
  { dot: string; label: string; tint: string; text: string }
> = {
  activo: {
    dot: "var(--color-info)",
    label: "Activo",
    tint: "color-mix(in srgb, var(--color-info) 14%, transparent)",
    text: "var(--color-info)",
  },
  pausado: {
    dot: "var(--color-warn)",
    label: "Pausado",
    tint: "color-mix(in srgb, var(--color-warn) 14%, transparent)",
    text: "var(--color-warn)",
  },
  completado: {
    dot: "var(--color-brand)",
    label: "Completado",
    tint: "color-mix(in srgb, var(--color-brand) 14%, transparent)",
    text: "var(--color-brand)",
  },
  cancelado: {
    dot: "var(--color-danger)",
    label: "Cancelado",
    tint: "color-mix(in srgb, var(--color-danger) 14%, transparent)",
    text: "var(--color-danger)",
  },
};

export function ClientCard({
  client,
  onCreate,
}: {
  client: ClientCardData;
  onCreate: (cliente_id: string) => void;
}) {
  const hasProyecto = client.proyecto !== null;

  if (!hasProyecto) {
    return (
      <div className="card-elevated p-5 flex flex-col gap-4 group">
        <Header client={client} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onCreate(client.id)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 h-9 text-[12.5px] font-medium rounded-[8px]",
            "border border-dashed border-[var(--color-b1)] text-[var(--color-t3)]",
            "hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)]",
            "transition-all duration-150",
          )}
        >
          <Plus size={13} />
          Crear roadmap
        </button>
      </div>
    );
  }

  const p = client.proyecto!;
  const estado = estadoColors[p.estado];

  return (
    <div className="card-elevated overflow-hidden group">
      <Link href={`/proyectos/${p.id}`} className="block p-5 pb-4">
        {/* Header con avatar */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <Header client={client} />
          <ArrowUpRight
            size={15}
            className="text-[var(--color-t3)] group-hover:text-[var(--color-brand)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0 mt-0.5"
          />
        </div>

        {/* Status badge + timestamp */}
        <div className="flex items-center gap-2 mb-3.5">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[10.5px] font-medium"
            style={{
              background: estado.tint,
              color: estado.text,
              border: `1px solid color-mix(in srgb, ${estado.text} 25%, transparent)`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: estado.dot }}
            />
            {estado.label}
          </span>
          <span className="text-[11px] text-[var(--color-t3)] truncate tabular-nums">
            {relativeTime(p.updated_at)}
          </span>
        </div>

        {/* Progress */}
        <ProgressBar
          value={p.fases_done}
          total={p.fases_total}
          showLabel
          thick
        />
      </Link>

      {p.publicToken ? (
        <div className="mx-5 mb-4 pt-3 border-t border-[var(--color-b1)]">
          <CopyLinkButton token={p.publicToken} />
        </div>
      ) : null}
    </div>
  );
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = getPublicUrl(token);
  const shortUrl = url.replace(/^https?:\/\//, "");

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "group/copy flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left",
        "bg-[color-mix(in_srgb,var(--color-s3)_70%,transparent)]",
        "border border-[var(--color-b1)]",
        "hover:border-[color-mix(in_srgb,var(--color-brand)_50%,var(--color-b1))]",
        "hover:bg-[color-mix(in_srgb,var(--color-brand-muted)_50%,var(--color-s3))]",
        "transition-all duration-150",
      )}
      title={url}
    >
      {copied ? (
        <Check
          size={12}
          className="flex-shrink-0 text-[var(--color-brand)]"
          strokeWidth={3}
        />
      ) : (
        <Link2
          size={12}
          className="flex-shrink-0 text-[var(--color-t3)] group-hover/copy:text-[var(--color-brand)] transition-colors"
        />
      )}
      <span
        className="flex-1 text-[10.5px] truncate"
        style={{
          fontFamily: "var(--ff-mono)",
          color: copied ? "var(--color-brand)" : "var(--color-t3)",
        }}
      >
        {copied ? "¡Copiado!" : shortUrl}
      </span>
    </button>
  );
}

function Header({ client }: { client: ClientCardData }) {
  const initials = client.nombre
    .split(/\s/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex items-start gap-3 min-w-0 flex-1">
      {/* Avatar square con gradient sutil */}
      <div
        className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0"
        style={{
          background:
            "linear-gradient(135deg, var(--color-brand), color-mix(in srgb, var(--color-brand) 50%, #000))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px color-mix(in srgb, var(--color-brand) 30%, transparent)",
        }}
        aria-hidden
      >
        {initials || <UserIcon size={14} />}
      </div>
      <div className="min-w-0 flex-1">
        <h3
          className="text-[14px] font-semibold text-[var(--color-t1)] truncate leading-tight"
          style={{ letterSpacing: "-0.01em" }}
        >
          {client.nombre}
        </h3>
        {client.empresa ? (
          <div className="flex items-center gap-1 mt-0.5 text-[11.5px] text-[var(--color-t3)] min-w-0">
            <Building2 size={10} className="flex-shrink-0" />
            <span className="truncate">{client.empresa}</span>
          </div>
        ) : null}
        {client.rubro ? (
          <span
            className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium rounded-full px-2 py-[2px] uppercase tracking-wider"
            style={{
              background: "var(--color-s3)",
              border: "1px solid var(--color-b1)",
              color: "var(--color-t2)",
            }}
          >
            <Circle size={5} className="fill-current opacity-70" />
            {client.rubro}
          </span>
        ) : null}
      </div>
    </div>
  );
}
