"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  FilterX,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { ClientCard, type ClientCardData } from "@/components/admin/ClientCard";
import { EmptyState } from "@/components/admin/EmptyState";
import { NewRoadmapDialog } from "@/components/admin/NewRoadmapDialog";
import { StatCards } from "@/components/admin/StatCards";

export interface DashboardClientProps {
  clients: ClientCardData[];
  plantillas: Array<{
    id: string;
    nombre: string;
    descripcion: string | null;
    rubro: string | null;
    fases_count: number;
  }>;
}

export function DashboardClient({ clients, plantillas }: DashboardClientProps) {
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);
  // Por default ocultamos los clientes del CRM sin roadmap — filtro para no
  // ver clientes que todavía no pasaron al flow de roadmap (leads, etc).
  const [showSinRoadmap, setShowSinRoadmap] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      // Filtro por búsqueda
      if (q) {
        const matchesQuery =
          c.nombre.toLowerCase().includes(q) ||
          (c.empresa?.toLowerCase().includes(q) ?? false) ||
          (c.rubro?.toLowerCase().includes(q) ?? false);
        if (!matchesQuery) return false;
      }
      // Filtro "solo con roadmap" (default)
      if (!showSinRoadmap && !c.proyecto) return false;
      return true;
    });
  }, [clients, query, showSinRoadmap]);

  const sinRoadmapCount = clients.filter((c) => !c.proyecto).length;

  const stats = useMemo(() => {
    const total = clients.length;
    const conRoadmap = clients.filter((c) => c.proyecto).length;
    const completados = clients.filter(
      (c) => c.proyecto?.estado === "completado",
    ).length;
    const enCurso = clients.filter(
      (c) => c.proyecto && c.proyecto.estado === "activo",
    ).length;
    return { total, conRoadmap, completados, enCurso };
  }, [clients]);

  const openDialogFor = (clienteId?: string) => {
    setPreselect(clienteId ?? null);
    setDialogOpen(true);
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-7 py-6 sm:py-8">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1
            className="font-semibold text-[var(--color-t1)]"
            style={{
              fontFamily: "var(--ff-sans)",
              fontSize: "clamp(24px, 3vw, 30px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            Clientes
          </h1>
          <p className="text-[13px] text-[var(--color-t3)] mt-1 max-w-[480px]">
            Gestioná los roadmaps de implementación. Cada cliente ve su progreso en vivo via link único.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => openDialogFor()}
          disabled={plantillas.length === 0}
        >
          <Plus size={14} strokeWidth={2.5} />
          Nuevo roadmap
        </Button>
      </div>

      <StatCards
        items={[
          { label: "Total clientes", value: stats.total, icon: Users, accent: "neutral" },
          {
            label: "Con roadmap",
            value: stats.conRoadmap,
            icon: Sparkles,
            accent: "info",
            hero: true,
            hint:
              stats.total > 0
                ? `${Math.round((stats.conRoadmap / stats.total) * 100)}% del total`
                : undefined,
          },
          {
            label: "En curso",
            value: stats.enCurso,
            icon: Clock,
            accent: "warn",
          },
          {
            label: "Completados",
            value: stats.completados,
            icon: CheckCircle2,
            accent: "brand",
          },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-t3)]"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, empresa o rubro…"
            className="pl-9"
          />
        </div>
        {sinRoadmapCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowSinRoadmap((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 h-10 px-3 text-[12px] font-medium rounded-[8px] border transition-all whitespace-nowrap",
              showSinRoadmap
                ? "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]"
                : "bg-[var(--color-s2)] border-[var(--color-b1)] text-[var(--color-t2)] hover:text-[var(--color-t1)] hover:border-[var(--color-b2)]",
            )}
            title={
              showSinRoadmap
                ? `Ocultar los ${sinRoadmapCount} cliente(s) del CRM sin roadmap`
                : `Mostrar ${sinRoadmapCount} cliente(s) del CRM sin roadmap`
            }
          >
            <FilterX size={13} />
            {showSinRoadmap ? "Ocultar" : "Mostrar"} sin roadmap ({sinRoadmapCount})
          </button>
        ) : null}
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay clientes todavía"
          description="Cargá clientes en la tabla `clientes` para empezar a armar roadmaps."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description={`No encontramos clientes que coincidan con "${query}".`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} onCreate={openDialogFor} />
          ))}
        </div>
      )}

      <NewRoadmapDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        preselectedClienteId={preselect}
        clientes={clients.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          empresa: c.empresa,
          hasProyecto: !!c.proyecto,
        }))}
        plantillas={plantillas}
      />
    </div>
  );
}
