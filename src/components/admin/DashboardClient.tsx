"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Users, CheckCircle2, Clock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.empresa?.toLowerCase().includes(q) ?? false) ||
        (c.rubro?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [clients, query]);

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
    <div className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-7 py-7">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--color-t1)]">
            Clientes
          </h1>
          <p className="text-[13px] text-[var(--color-t3)] mt-0.5">
            Gestioná los roadmaps de implementación de cada cliente.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => openDialogFor()}
          disabled={plantillas.length === 0}
        >
          <Plus size={14} />
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

      <div className="relative mb-5 max-w-md">
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
