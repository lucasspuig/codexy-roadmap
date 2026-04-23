import { notFound } from "next/navigation";

import { ProyectoEditor } from "@/components/admin/ProyectoEditor";
import { createClient } from "@/lib/supabase/server";
import type {
  Cliente,
  Profile,
  RoadmapEvento,
  RoadmapFase,
  RoadmapItem,
  RoadmapProyecto,
  RoadmapTokenPublico,
} from "@/types/database";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("roadmap_proyectos")
    .select("nombre")
    .eq("id", id)
    .maybeSingle<{ nombre: string }>();
  return { title: data?.nombre ?? "Roadmap" };
}

export default async function ProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proyecto } = await supabase
    .from("roadmap_proyectos")
    .select("*")
    .eq("id", id)
    .maybeSingle<RoadmapProyecto>();

  if (!proyecto) notFound();

  const [clienteRes, fasesRes, tokensRes, eventosRes, pmsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, email, telefono, empresa, rubro, tipo, estado_venta, created_at")
      .eq("id", proyecto.cliente_id)
      .maybeSingle<Cliente>(),
    supabase
      .from("roadmap_fases")
      .select("*, items:roadmap_items(*)")
      .eq("proyecto_id", id)
      .order("orden", { ascending: true }),
    supabase
      .from("roadmap_tokens_publicos")
      .select("*")
      .eq("proyecto_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("roadmap_eventos")
      .select("*")
      .eq("proyecto_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("profiles")
      .select("id, email, nombre, role, avatar_url, activo, created_at")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
  ]);

  type FaseWithItems = RoadmapFase & { items: RoadmapItem[] | null };
  const fases: FaseWithItems[] =
    (fasesRes.data as FaseWithItems[] | null)?.map((f) => ({
      ...f,
      items: (f.items ?? []).sort((a, b) => a.orden - b.orden),
    })) ?? [];
  const tokens: RoadmapTokenPublico[] = tokensRes.data ?? [];
  const activeToken = tokens.find((t) => t.activo) ?? tokens[0] ?? null;
  const eventos: RoadmapEvento[] = eventosRes.data ?? [];
  const pms: Profile[] = (pmsRes.data as Profile[] | null) ?? [];

  return (
    <ProyectoEditor
      proyecto={proyecto}
      cliente={clienteRes.data}
      fases={fases}
      token={activeToken}
      eventos={eventos}
      pms={pms}
    />
  );
}
