"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePublicToken } from "@/lib/token";
import type {
  Cliente,
  FaseEstado,
  Profile,
  RoadmapFase,
  RoadmapItem,
  RoadmapPlantilla,
  RoadmapProyecto,
} from "@/types/database";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Verifica que haya un usuario autenticado con profile activo.
 * Defense-in-depth sobre RLS. Devuelve el perfil + user id si todo ok.
 */
async function assertAdmin(): Promise<
  | { ok: true; userId: string; profile: Pick<Profile, "id" | "nombre" | "email" | "role" | "activo"> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, activo")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as
    | Pick<Profile, "id" | "nombre" | "email" | "role" | "activo">
    | null;

  if (!profile || !profile.activo) return { ok: false, error: "Cuenta inactiva" };

  return { ok: true, userId: user.id, profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crear proyecto desde plantilla
// ─────────────────────────────────────────────────────────────────────────────

export async function createProyectoFromPlantilla(input: {
  cliente_id: string;
  plantilla_id: string;
  nombre?: string;
  subtitulo?: string;
}): Promise<ActionResult<{ proyecto_id: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const cliente_id = String(input.cliente_id || "").trim();
  const plantilla_id = String(input.plantilla_id || "").trim();
  if (!cliente_id || !plantilla_id) {
    return { ok: false, error: "Cliente y plantilla son requeridos" };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Validar cliente
  const { data: clienteRaw, error: clienteErr } = await supabase
    .from("clientes")
    .select("id, nombre, empresa")
    .eq("id", cliente_id)
    .single();
  const cliente = clienteRaw as Pick<Cliente, "id" | "nombre" | "empresa"> | null;
  if (clienteErr || !cliente) {
    return { ok: false, error: "Cliente no encontrado" };
  }

  // Validar que no exista ya un proyecto
  const { data: existing } = await supabase
    .from("roadmap_proyectos")
    .select("id")
    .eq("cliente_id", cliente_id)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return { ok: false, error: "Este cliente ya tiene un roadmap" };
  }

  // Obtener plantilla
  const { data: plantillaRaw, error: plantErr } = await supabase
    .from("roadmap_plantillas")
    .select("id, nombre, fases")
    .eq("id", plantilla_id)
    .single();
  const plantilla = plantillaRaw as Pick<
    RoadmapPlantilla,
    "id" | "nombre" | "fases"
  > | null;
  if (plantErr || !plantilla) {
    return { ok: false, error: "Plantilla no encontrada" };
  }

  const fases = Array.isArray(plantilla.fases) ? plantilla.fases : [];
  if (fases.length === 0) {
    return { ok: false, error: "La plantilla no tiene fases" };
  }

  const nombre =
    input.nombre?.trim() ||
    `Roadmap ${cliente.empresa || cliente.nombre}`;
  const subtitulo =
    input.subtitulo?.trim() ||
    (cliente.empresa ? `Implementación Codexy · ${cliente.empresa}` : "Implementación Codexy");

  // Usar admin para hacerlo "atómico" secuencialmente. Si falla algo intermedio, rollback manual.
  const { data: proyectoRaw, error: projErr } = await admin
    .from("roadmap_proyectos")
    .insert({
      cliente_id,
      nombre,
      subtitulo,
      estado: "activo",
      fecha_inicio: new Date().toISOString().slice(0, 10),
      pm_id: guard.userId,
    })
    .select("id")
    .single();

  const proyecto = proyectoRaw as { id: string } | null;
  if (projErr || !proyecto) {
    return { ok: false, error: projErr?.message || "No se pudo crear el proyecto" };
  }

  try {
    // Insertar fases e items
    for (const fase of fases) {
      const { data: faseRowRaw, error: faseErr } = await admin
        .from("roadmap_fases")
        .insert({
          proyecto_id: proyecto.id,
          orden: fase.orden,
          icono: fase.icono || null,
          titulo: fase.titulo,
          descripcion: fase.descripcion || "",
          estado: "pending" as FaseEstado,
        })
        .select("id")
        .single();
      const faseRow = faseRowRaw as { id: string } | null;
      if (faseErr || !faseRow) throw new Error(faseErr?.message || "Error creando fase");

      const items = Array.isArray(fase.items) ? fase.items : [];
      if (items.length > 0) {
        const rows = items.map((texto, i) => ({
          fase_id: faseRow.id,
          orden: i + 1,
          texto: String(texto),
          completado: false,
        }));
        const { error: itemsErr } = await admin.from("roadmap_items").insert(rows);
        if (itemsErr) throw new Error(itemsErr.message);
      }
    }

    // Token público
    const token = generatePublicToken();
    const { error: tokErr } = await admin.from("roadmap_tokens_publicos").insert({
      token,
      proyecto_id: proyecto.id,
      activo: true,
    });
    if (tokErr) throw new Error(tokErr.message);

    // Evento (el trigger puede no disparar para creación manual; lo grabamos nosotros)
    await admin.from("roadmap_eventos").insert({
      proyecto_id: proyecto.id,
      tipo: "roadmap_creado",
      mensaje: `Roadmap creado desde plantilla "${plantilla.nombre}"`,
      actor_id: guard.userId,
      actor_nombre: guard.profile.nombre || guard.profile.email,
      visible_cliente: false,
    });
  } catch (err) {
    // Rollback best-effort
    await admin.from("roadmap_proyectos").delete().eq("id", proyecto.id);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error creando fases/items",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/proyectos/${proyecto.id}`);
  return { ok: true, data: { proyecto_id: proyecto.id } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Eliminar proyecto
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteProyecto(id: string): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_proyectos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

export async function deleteProyectoAndRedirect(id: string): Promise<void> {
  const res = await deleteProyecto(id);
  if (!res.ok) throw new Error(res.error);
  redirect("/dashboard");
}

// ─────────────────────────────────────────────────────────────────────────────
// Proyecto: metadata update
// ─────────────────────────────────────────────────────────────────────────────

export async function updateProyectoMeta(input: {
  id: string;
  nombre?: string;
  subtitulo?: string | null;
  estado?: "activo" | "pausado" | "completado" | "cancelado";
  fecha_inicio?: string;
  fecha_estimada_fin?: string | null;
  pm_id?: string | null;
  notas_internas?: string | null;
}): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const { id, ...rest } = input;
  if (!id) return { ok: false, error: "ID requerido" };

  const patch: Partial<RoadmapProyecto> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) {
      (patch as Record<string, unknown>)[k] = v;
    }
  }
  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_proyectos").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${id}`);
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fases
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertFase(input: {
  id?: string;
  proyecto_id: string;
  orden?: number;
  titulo: string;
  descripcion?: string;
  icono?: string | null;
  estado?: FaseEstado;
}): Promise<ActionResult<{ id: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const titulo = String(input.titulo || "").trim();
  if (!titulo) return { ok: false, error: "El título es requerido" };
  if (!input.proyecto_id) return { ok: false, error: "proyecto_id requerido" };

  const supabase = await createClient();

  if (input.id) {
    const patch: Partial<RoadmapFase> = {
      titulo,
      descripcion: input.descripcion ?? "",
    };
    if (input.icono !== undefined) patch.icono = input.icono;
    if (input.estado !== undefined) patch.estado = input.estado;
    if (input.orden !== undefined) patch.orden = input.orden;
    const { error } = await supabase.from("roadmap_fases").update(patch).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/proyectos/${input.proyecto_id}`);
    return { ok: true, data: { id: input.id } };
  }

  // Insert: calcular orden automático
  let orden = input.orden;
  if (orden === undefined) {
    const { data: maxRowRaw } = await supabase
      .from("roadmap_fases")
      .select("orden")
      .eq("proyecto_id", input.proyecto_id)
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle<{ orden: number }>();
    orden = (maxRowRaw?.orden ?? 0) + 1;
  }

  const { data: inserted, error } = await supabase
    .from("roadmap_fases")
    .insert({
      proyecto_id: input.proyecto_id,
      orden,
      titulo,
      descripcion: input.descripcion ?? "",
      icono: input.icono ?? null,
      estado: input.estado ?? ("pending" as FaseEstado),
    })
    .select("id")
    .single();

  const data = inserted as { id: string } | null;
  if (error || !data) return { ok: false, error: error?.message || "Error" };
  revalidatePath(`/proyectos/${input.proyecto_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteFase(input: {
  id: string;
  proyecto_id: string;
}): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!input.id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_fases").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id}`);
  return { ok: true, data: null };
}

export async function reorderFases(
  proyecto_id: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!proyecto_id || !Array.isArray(orderedIds)) {
    return { ok: false, error: "Argumentos inválidos" };
  }

  // Usamos admin para evitar problemas con UNIQUE(proyecto_id, orden) en actualizaciones en cadena:
  // Estrategia: primero seteamos todos a orden negativo (para liberar la unique), luego al orden final.
  const admin = createAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("roadmap_fases")
      .update({ orden: -(i + 1) })
      .eq("id", orderedIds[i])
      .eq("proyecto_id", proyecto_id);
    if (error) return { ok: false, error: error.message };
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("roadmap_fases")
      .update({ orden: i + 1 })
      .eq("id", orderedIds[i])
      .eq("proyecto_id", proyecto_id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/proyectos/${proyecto_id}`);
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertItem(input: {
  id?: string;
  fase_id: string;
  proyecto_id: string;
  orden?: number;
  texto: string;
  completado?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const texto = String(input.texto || "").trim();
  if (!texto) return { ok: false, error: "Texto requerido" };
  if (!input.fase_id) return { ok: false, error: "fase_id requerido" };

  const supabase = await createClient();

  if (input.id) {
    const patch: Partial<RoadmapItem> = { texto };
    if (input.completado !== undefined) {
      patch.completado = input.completado;
      patch.completado_at = input.completado ? new Date().toISOString() : null;
    }
    if (input.orden !== undefined) patch.orden = input.orden;
    const { error } = await supabase.from("roadmap_items").update(patch).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/proyectos/${input.proyecto_id}`);
    return { ok: true, data: { id: input.id } };
  }

  let orden = input.orden;
  if (orden === undefined) {
    const { data: maxRowRaw } = await supabase
      .from("roadmap_items")
      .select("orden")
      .eq("fase_id", input.fase_id)
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle<{ orden: number }>();
    orden = (maxRowRaw?.orden ?? 0) + 1;
  }

  const { data: inserted, error } = await supabase
    .from("roadmap_items")
    .insert({
      fase_id: input.fase_id,
      orden,
      texto,
      completado: input.completado ?? false,
    })
    .select("id")
    .single();

  const data = inserted as { id: string } | null;
  if (error || !data) return { ok: false, error: error?.message || "Error" };
  revalidatePath(`/proyectos/${input.proyecto_id}`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteItem(input: {
  id: string;
  proyecto_id: string;
}): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!input.id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_items").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/proyectos/${input.proyecto_id}`);
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Token
// ─────────────────────────────────────────────────────────────────────────────

export async function regenerateToken(
  proyecto_id: string,
): Promise<ActionResult<{ token: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!proyecto_id) return { ok: false, error: "proyecto_id requerido" };

  const admin = createAdminClient();
  // Desactivar tokens previos
  await admin
    .from("roadmap_tokens_publicos")
    .update({ activo: false })
    .eq("proyecto_id", proyecto_id);

  const token = generatePublicToken();
  const { error } = await admin.from("roadmap_tokens_publicos").insert({
    token,
    proyecto_id,
    activo: true,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${proyecto_id}`);
  return { ok: true, data: { token } };
}

export async function toggleTokenActivo(
  token: string,
  activo: boolean,
): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!token) return { ok: false, error: "token requerido" };

  const supabase = await createClient();
  const { data: rowRaw, error: selErr } = await supabase
    .from("roadmap_tokens_publicos")
    .select("proyecto_id")
    .eq("token", token)
    .single();
  const row = rowRaw as { proyecto_id: string } | null;
  if (selErr || !row) return { ok: false, error: "Token no encontrado" };

  const { error } = await supabase
    .from("roadmap_tokens_publicos")
    .update({ activo })
    .eq("token", token);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${row.proyecto_id}`);
  return { ok: true, data: null };
}
