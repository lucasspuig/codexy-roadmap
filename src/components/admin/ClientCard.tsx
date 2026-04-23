"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Plus, Building2, Circle, Link2, Check } from "lucide-react";
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

const estadoDot: Record<ProyectoEstado, string> = {
  activo: "bg-[var(--color-info)]",
  pausado: "bg-[var(--color-warn)]",
  completado: "bg-[var(--color-brand)]",
  cancelado: "bg-[var(--color-danger)]",
};

const estadoLabel: Record<ProyectoEstado, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

export function ClientCard({
  client,
  onCreate,
}: {
  client: ClientCardData;
  onCreate: (cliente_id: string) => void;
}) {
  const hasProyecto = client.proyecto !== null;
  const commonCard =
    "group relative rounded-[14px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5 transition-all duration-150 hover:border-[var(--color-b2)]";

  if (!hasProyecto) {
    return (
      <div className={cn(commonCard, "flex flex-col gap-4")}>
        <Header client={client} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onCreate(client.id)}
          className="inline-flex items-center justify-center gap-1.5 h-9 text-[13px] font-medium rounded-[7px] border border-dashed border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)] transition-all"
        >
          <Plus size={14} />
          Crear roadmap
        </button>
      </div>
    );
  }

  const p = client.proyecto!;
  return (
    <div className={cn(commonCard, "hover:shadow-[0_0_0_1px_var(--color-b2)]")}>
      <Link href={`/proyectos/${p.id}`} className="block">
        <div className="flex items-start justify-between gap-2 mb-4">
          <Header client={client} />
          <ArrowUpRight
            size={15}
            className="text-[var(--color-t3)] group-hover:text-[var(--color-brand)] transition-colors flex-shrink-0 mt-0.5"
          />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full flex-shrink-0",
              estadoDot[p.estado],
            )}
          />
          <span className="text-[11px] font-medium text-[var(--color-t2)]">
            {estadoLabel[p.estado]}
          </span>
          <span className="text-[11px] text-[var(--color-t3)]">·</span>
          <span className="text-[11px] text-[var(--color-t3)] truncate">
            {relativeTime(p.updated_at)}
          </span>
        </div>
        <ProgressBar value={p.fases_done} total={p.fases_total} showLabel />
      </Link>
      {p.publicToken ? (
        <div className="mt-3 pt-3 border-t border-[var(--color-b1)]">
          <CopyLinkButton token={p.publicToken} />
        </div>
      ) : null}
    </div>
  );
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = getPublicUrl(token);

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
        "group/copy flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left transition-all",
        "bg-[var(--color-s2)] hover:bg-[var(--color-s3)] border border-[var(--color-b1)] hover:border-[var(--color-brand)]",
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
      <span className="flex-1 text-[11px] text-[var(--color-t2)] truncate font-mono">
        {copied ? "¡Copiado!" : url.replace(/^https?:\/\//, "")}
      </span>
    </button>
  );
}

function Header({ client }: { client: ClientCardData }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-medium text-[var(--color-t1)] truncate">
          {client.nombre}
        </h3>
      </div>
      {client.empresa ? (
        <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-[var(--color-t3)] min-w-0">
          <Building2 size={11} className="flex-shrink-0" />
          <span className="truncate">{client.empresa}</span>
        </div>
      ) : null}
      {client.rubro ? (
        <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-medium bg-[var(--color-s3)] border border-[var(--color-b1)] rounded-full px-2 py-0.5 text-[var(--color-t2)]">
          <Circle size={6} className="fill-current" />
          {client.rubro}
        </span>
      ) : null}
    </div>
  );
}
