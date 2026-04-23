import { DashboardClient } from "@/components/admin/DashboardClient";
import type { ClientCardData } from "@/components/admin/ClientCard";
import { createClient } from "@/lib/supabase/server";
import type { FaseEstado, ProyectoEstado, RoadmapPlantilla } from "@/types/database";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type ProyectoRow = {
  id: string;
  cliente_id: string;
  nombre: string;
  estado: ProyectoEstado;
  updated_at: string;
  fases: Array<{ estado: FaseEstado }> | null;
};

type ClienteRow = {
  id: string;
  nombre: string;
  empresa: string | null;
  rubro: string | null;
  tipo: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [clientesRes, proyectosRes, plantillasRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, empresa, rubro, tipo")
      .eq("tipo", "cliente")
      .order("nombre", { ascending: true }),
    supabase
      .from("roadmap_proyectos")
      .select("id, cliente_id, nombre, estado, updated_at, fases:roadmap_fases(estado)"),
    supabase
      .from("roadmap_plantillas")
      .select("id, nombre, descripcion, rubro, fases, activa")
      .eq("activa", true)
      .order("nombre", { ascending: true }),
  ]);

  const clientes: ClienteRow[] = (clientesRes.data as ClienteRow[] | null) ?? [];
  const proyectos: ProyectoRow[] = (proyectosRes.data as ProyectoRow[] | null) ?? [];
  const plantillasRaw: RoadmapPlantilla[] =
    (plantillasRes.data as RoadmapPlantilla[] | null) ?? [];

  const proyectoByCliente = new Map<string, ProyectoRow>();
  for (const p of proyectos) {
    proyectoByCliente.set(p.cliente_id, p);
  }

  const cards: ClientCardData[] = clientes.map((c) => {
    const p = proyectoByCliente.get(c.id);
    if (!p) {
      return {
        id: c.id,
        nombre: c.nombre,
        empresa: c.empresa,
        rubro: c.rubro,
        proyecto: null,
      };
    }
    const fases = p.fases ?? [];
    const done = fases.filter((f) => f.estado === "done").length;
    const active = fases.filter((f) => f.estado === "active").length;
    return {
      id: c.id,
      nombre: c.nombre,
      empresa: c.empresa,
      rubro: c.rubro,
      proyecto: {
        id: p.id,
        nombre: p.nombre,
        estado: p.estado,
        updated_at: p.updated_at,
        fases_total: fases.length,
        fases_done: done,
        fases_active: active,
      },
    };
  });

  const plantillas = plantillasRaw.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    rubro: p.rubro,
    fases_count: Array.isArray(p.fases) ? p.fases.length : 0,
  }));

  return <DashboardClient clients={cards} plantillas={plantillas} />;
}
