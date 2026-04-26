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

  // Usamos el cliente regular (cookie auth). RLS ya permite a los miembros del
  // equipo activos hacer insert/update/delete sobre todas las tablas roadmap_*.
  // Antes esto usaba el admin client, pero generaba un 401 cuando la
  // SUPABASE_SERVICE_ROLE_KEY no estaba bien cargada en el server.
  const { data: proyectoRaw, error: projErr } = await supabase
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
      const { data: faseRowRaw, error: faseErr } = await supabase
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
        const { error: itemsErr } = await supabase
          .from("roadmap_items")
          .insert(rows);
        if (itemsErr) throw new Error(itemsErr.message);
      }
    }

    // Token público
    const token = generatePublicToken();
    const { error: tokErr } = await supabase
      .from("roadmap_tokens_publicos")
      .insert({
        token,
        proyecto_id: proyecto.id,
        activo: true,
      });
    if (tokErr) throw new Error(tokErr.message);

    // Evento (el trigger puede no disparar para creación manual; lo grabamos nosotros)
    await supabase.from("roadmap_eventos").insert({
      proyecto_id: proyecto.id,
      tipo: "roadmap_creado",
      mensaje: `Roadmap creado desde plantilla "${plantilla.nombre}"`,
      actor_id: guard.userId,
      actor_nombre: guard.profile.nombre || guard.profile.email,
      visible_cliente: false,
    });
  } catch (err) {
    // Rollback best-effort
    await supabase.from("roadmap_proyectos").delete().eq("id", proyecto.id);
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

// ─────────────────────────────────────────────────────────────────────────────
// Editar datos del cliente
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCliente(input: {
  cliente_id: string;
  nombre: string;
  empresa?: string | null;
  email?: string | null;
  telefono?: string | null;
  rubro?: string | null;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  if (nombre.length > 120) return { ok: false, error: "El nombre es demasiado largo" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre,
      empresa: (input.empresa ?? null) || null,
      email: (input.email ?? null) || null,
      telefono: (input.telefono ?? null) || null,
      rubro: (input.rubro ?? null) || null,
    })
    .eq("id", input.cliente_id);
  if (error) return { ok: false, error: error.message };

  // Buscar proyecto asociado para revalidar su página (si existe).
  const { data: proy } = await supabase
    .from("roadmap_proyectos")
    .select("id")
    .eq("cliente_id", input.cliente_id)
    .maybeSingle<{ id: string }>();
  if (proy?.id) revalidatePath(`/proyectos/${proy.id}`);
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding: upload de logo + update de paleta
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function sanitizeColors(raw: unknown): RoadmapProyecto["brand_colors"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: RoadmapProyecto["brand_colors"] = {};
  for (const key of ["primary", "accent", "bg", "text"] as const) {
    const v = r[key];
    if (isHex(v)) out![key] = v;
  }
  return Object.keys(out!).length > 0 ? out : null;
}

export async function updateBranding(input: {
  proyecto_id: string;
  colors?: unknown;
  logo_url?: string | null;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const patch: { brand_colors?: RoadmapProyecto["brand_colors"]; brand_logo_url?: string | null } =
    {};
  if ("colors" in input) patch.brand_colors = sanitizeColors(input.colors);
  if ("logo_url" in input) {
    const logoUrl = input.logo_url;
    if (logoUrl !== null && logoUrl !== undefined && typeof logoUrl !== "string") {
      return { ok: false, error: "URL de logo inválida" };
    }
    patch.brand_logo_url = logoUrl || null;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nada para actualizar" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("roadmap_proyectos")
    .update(patch)
    .eq("id", input.proyecto_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id}`);
  return { ok: true, data: null };
}

/**
 * Sube un logo al bucket `roadmap-branding` y retorna la URL pública.
 * Usa service-role para bypasear políticas de storage (defense in depth aparte del auth check).
 */
export async function uploadBrandLogo(formData: FormData): Promise<
  ActionResult<{ url: string; path: string }>
> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  const proyectoId = formData.get("proyecto_id");
  if (!(file instanceof File)) return { ok: false, error: "Archivo no recibido" };
  if (typeof proyectoId !== "string" || proyectoId.length < 10) {
    return { ok: false, error: "proyecto_id inválido" };
  }
  if (!ALLOWED_LOGO_MIME.has(file.type)) {
    return { ok: false, error: "Formato no permitido. Usá PNG, JPG, WEBP o SVG." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "El logo supera 2 MB" };
  }

  const ext =
    file.type === "image/svg+xml"
      ? "svg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
  const path = `${proyectoId}/${Date.now()}.${ext}`;

  // Defensa: el service role se necesita para escribir al bucket storage.
  // Si no está, surface al user un error específico en vez de "unknown error".
  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Config inválida";
    return {
      ok: false,
      error: `Config del server incompleta: ${msg}. Revisá la env var SUPABASE_SERVICE_ROLE_KEY en Easypanel.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("roadmap-branding")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) {
    // Errores comunes de storage: key inválida, bucket no existe, tamaño, etc.
    const hint = upErr.message.toLowerCase().includes("jwt") ||
      upErr.message.toLowerCase().includes("unauthorized")
      ? " (probable: SUPABASE_SERVICE_ROLE_KEY mal cargada en Easypanel)"
      : "";
    return { ok: false, error: `${upErr.message}${hint}` };
  }

  const { data: pub } = admin.storage.from("roadmap-branding").getPublicUrl(path);
  const url = pub.publicUrl;

  // Borrar logos anteriores de este proyecto (mantener storage limpio).
  const { data: list } = await admin.storage
    .from("roadmap-branding")
    .list(proyectoId, { limit: 100 });
  if (list && list.length > 1) {
    const current = path.split("/").pop();
    const toDelete = list
      .filter((f) => f.name !== current)
      .map((f) => `${proyectoId}/${f.name}`);
    if (toDelete.length > 0) {
      await admin.storage.from("roadmap-branding").remove(toDelete);
    }
  }

  // Actualizar proyecto con la nueva URL.
  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("roadmap_proyectos")
    .update({ brand_logo_url: url })
    .eq("id", proyectoId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/proyectos/${proyectoId}`);
  return { ok: true, data: { url, path } };
}

export async function removeBrandLogo(input: {
  proyecto_id: string;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: list } = await admin.storage
    .from("roadmap-branding")
    .list(input.proyecto_id, { limit: 100 });
  if (list && list.length > 0) {
    await admin.storage
      .from("roadmap-branding")
      .remove(list.map((f) => `${input.proyecto_id}/${f.name}`));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("roadmap_proyectos")
    .update({ brand_logo_url: null })
    .eq("id", input.proyecto_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id}`);
  return { ok: true, data: null };
}
