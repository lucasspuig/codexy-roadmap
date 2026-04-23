import { z } from "zod";
import { supa, generateTokenHex } from "./supabase.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function fail(msg: string): ToolResult {
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

/** ─── Schemas Zod (validación y doc para Claude) ─── */
export const schemas = {
  list_clientes: z.object({
    busqueda: z.string().optional().describe("filtrar por nombre/empresa"),
    solo_con_roadmap: z.boolean().optional().describe("solo clientes que ya tienen roadmap"),
  }),
  get_roadmap: z.object({
    cliente: z.string().describe("nombre exacto o substring del cliente"),
  }),
  create_roadmap: z.object({
    cliente: z.string().describe("nombre del cliente"),
    plantilla: z
      .string()
      .optional()
      .describe("nombre de plantilla a usar, default 'ClinicForge estándar'"),
    nombre: z.string().optional(),
    subtitulo: z.string().optional(),
  }),
  add_fase: z.object({
    proyecto_id: z.string().uuid(),
    titulo: z.string(),
    descripcion: z.string().optional(),
    items: z.array(z.string()).optional().describe("texto de items a crear"),
    orden: z.number().int().optional(),
  }),
  update_fase: z.object({
    fase_id: z.string().uuid(),
    titulo: z.string().optional(),
    descripcion: z.string().optional(),
    estado: z.enum(["pending", "active", "done"]).optional(),
  }),
  mark_fase_done: z.object({
    proyecto_id: z.string().uuid(),
    orden: z.number().int().describe("número de fase (orden), no uuid"),
  }),
  mark_fase_active: z.object({
    proyecto_id: z.string().uuid(),
    orden: z.number().int(),
  }),
  add_item: z.object({
    fase_id: z.string().uuid(),
    texto: z.string(),
  }),
  toggle_item: z.object({
    item_id: z.string().uuid(),
    completado: z.boolean().optional().describe("si no pasás, toggle"),
  }),
  update_cliente: z.object({
    cliente_id: z.string().uuid(),
    nombre: z.string().optional(),
    empresa: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    telefono: z.string().nullable().optional(),
    rubro: z.string().nullable().optional(),
  }),
  regenerate_public_link: z.object({
    proyecto_id: z.string().uuid(),
  }),
  get_public_url: z.object({
    proyecto_id: z.string().uuid(),
  }),
};

function publicUrl(token: string): string {
  const base = process.env.PUBLIC_APP_URL ?? "https://plan.codexyoficial.com";
  return `${base.replace(/\/$/, "")}/r/${token}`;
}

async function findCliente(busqueda: string) {
  const { data, error } = await supa()
    .from("clientes")
    .select("id, nombre, empresa, email, telefono, rubro, tipo")
    .ilike("nombre", `%${busqueda}%`)
    .eq("tipo", "cliente")
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

async function logEvento(
  proyecto_id: string,
  tipo: string,
  mensaje: string,
  fase_id: string | null = null,
) {
  await supa()
    .from("roadmap_eventos")
    .insert({
      proyecto_id,
      fase_id,
      tipo,
      mensaje,
      actor_nombre: "Claude (MCP)",
      visible_cliente: tipo !== "comentario",
    });
}

/** ─── Implementación de cada tool ─── */
export const handlers: Record<string, (args: unknown) => Promise<ToolResult>> = {
  async list_clientes(args) {
    const { busqueda, solo_con_roadmap } = schemas.list_clientes.parse(args);
    const s = supa();
    let q = s.from("clientes").select(
      "id, nombre, empresa, rubro, roadmap_proyectos(id, nombre, estado)",
    );
    if (busqueda) q = q.ilike("nombre", `%${busqueda}%`);
    q = q.eq("tipo", "cliente").order("nombre");
    const { data, error } = await q;
    if (error) return fail(error.message);
    let rows = data ?? [];
    if (solo_con_roadmap) {
      rows = rows.filter((r) => {
        const proyectos = r.roadmap_proyectos as unknown as Array<{ id: string }>;
        return proyectos && proyectos.length > 0;
      });
    }
    return ok(rows);
  },

  async get_roadmap(args) {
    const { cliente } = schemas.get_roadmap.parse(args);
    const rows = await findCliente(cliente);
    if (rows.length === 0) return fail(`No se encontró cliente para "${cliente}"`);
    if (rows.length > 1) {
      return ok({
        multiples_resultados: rows.map((r) => ({ id: r.id, nombre: r.nombre })),
      });
    }
    const c = rows[0]!;
    const { data: proy } = await supa()
      .from("roadmap_proyectos")
      .select("*, fases:roadmap_fases(*, items:roadmap_items(*))")
      .eq("cliente_id", c.id)
      .maybeSingle();
    if (!proy) return ok({ cliente: c, proyecto: null, mensaje: "Sin roadmap aún" });
    return ok({ cliente: c, proyecto: proy });
  },

  async create_roadmap(args) {
    const { cliente, plantilla, nombre, subtitulo } =
      schemas.create_roadmap.parse(args);
    const rows = await findCliente(cliente);
    if (rows.length === 0) return fail(`Cliente no encontrado: ${cliente}`);
    if (rows.length > 1) return fail("Múltiples coincidencias, refiná el nombre");
    const c = rows[0]!;

    const s = supa();
    const { data: plantillaRow } = await s
      .from("roadmap_plantillas")
      .select("*")
      .eq("nombre", plantilla ?? "ClinicForge estándar")
      .maybeSingle();
    if (!plantillaRow) return fail("Plantilla no encontrada");

    // crear proyecto
    const { data: proy, error: pErr } = await s
      .from("roadmap_proyectos")
      .insert({
        cliente_id: c.id,
        nombre: nombre ?? "Plan de implementación",
        subtitulo: subtitulo ?? plantillaRow.descripcion,
      })
      .select("id")
      .single();
    if (pErr || !proy) return fail(pErr?.message ?? "error creando proyecto");

    // crear fases
    const fasesPlantilla = plantillaRow.fases as Array<{
      orden: number;
      titulo: string;
      descripcion: string;
      items: string[];
    }>;
    for (const f of fasesPlantilla) {
      const { data: fase } = await s
        .from("roadmap_fases")
        .insert({
          proyecto_id: proy.id,
          orden: f.orden,
          titulo: f.titulo,
          descripcion: f.descripcion,
        })
        .select("id")
        .single();
      if (fase && f.items?.length) {
        await s.from("roadmap_items").insert(
          f.items.map((t, i) => ({
            fase_id: fase.id,
            orden: i,
            texto: t,
          })),
        );
      }
    }

    // token público
    const token = generateTokenHex();
    await s
      .from("roadmap_tokens_publicos")
      .insert({ token, proyecto_id: proy.id });

    await logEvento(proy.id, "roadmap_creado", `Roadmap creado para ${c.nombre}`);

    return ok({
      proyecto_id: proy.id,
      cliente: c.nombre,
      link_publico: publicUrl(token),
    });
  },

  async add_fase(args) {
    const { proyecto_id, titulo, descripcion, items, orden } =
      schemas.add_fase.parse(args);
    const s = supa();
    let ord = orden;
    if (ord === undefined) {
      const { data: lastFase } = await s
        .from("roadmap_fases")
        .select("orden")
        .eq("proyecto_id", proyecto_id)
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle();
      ord = (lastFase?.orden ?? 0) + 1;
    }
    const { data: fase, error } = await s
      .from("roadmap_fases")
      .insert({ proyecto_id, orden: ord, titulo, descripcion: descripcion ?? "" })
      .select("*")
      .single();
    if (error) return fail(error.message);
    if (items?.length) {
      await s.from("roadmap_items").insert(
        items.map((t, i) => ({ fase_id: fase!.id, orden: i, texto: t })),
      );
    }
    return ok(fase);
  },

  async update_fase(args) {
    const patch = schemas.update_fase.parse(args);
    const { fase_id, ...rest } = patch;
    const { data, error } = await supa()
      .from("roadmap_fases")
      .update(rest)
      .eq("id", fase_id)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data);
  },

  async mark_fase_done(args) {
    const { proyecto_id, orden } = schemas.mark_fase_done.parse(args);
    const { data, error } = await supa()
      .from("roadmap_fases")
      .update({ estado: "done" })
      .eq("proyecto_id", proyecto_id)
      .eq("orden", orden)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data);
  },

  async mark_fase_active(args) {
    const { proyecto_id, orden } = schemas.mark_fase_active.parse(args);
    const { data, error } = await supa()
      .from("roadmap_fases")
      .update({ estado: "active" })
      .eq("proyecto_id", proyecto_id)
      .eq("orden", orden)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data);
  },

  async add_item(args) {
    const { fase_id, texto } = schemas.add_item.parse(args);
    const s = supa();
    const { data: last } = await s
      .from("roadmap_items")
      .select("orden")
      .eq("fase_id", fase_id)
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ord = (last?.orden ?? -1) + 1;
    const { data, error } = await s
      .from("roadmap_items")
      .insert({ fase_id, orden: ord, texto })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data);
  },

  async toggle_item(args) {
    const { item_id, completado } = schemas.toggle_item.parse(args);
    const s = supa();
    let nextValue: boolean;
    if (completado !== undefined) {
      nextValue = completado;
    } else {
      const { data: current } = await s
        .from("roadmap_items")
        .select("completado")
        .eq("id", item_id)
        .single();
      nextValue = !(current?.completado ?? false);
    }
    const { data, error } = await s
      .from("roadmap_items")
      .update({ completado: nextValue })
      .eq("id", item_id)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data);
  },

  async update_cliente(args) {
    const { cliente_id, ...rest } = schemas.update_cliente.parse(args);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return fail("Nada para actualizar");
    const { data, error } = await supa()
      .from("clientes")
      .update(patch)
      .eq("id", cliente_id)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data);
  },

  async regenerate_public_link(args) {
    const { proyecto_id } = schemas.regenerate_public_link.parse(args);
    const s = supa();
    await s
      .from("roadmap_tokens_publicos")
      .update({ activo: false })
      .eq("proyecto_id", proyecto_id);
    const token = generateTokenHex();
    const { error } = await s
      .from("roadmap_tokens_publicos")
      .insert({ token, proyecto_id });
    if (error) return fail(error.message);
    return ok({ nueva_url: publicUrl(token) });
  },

  async get_public_url(args) {
    const { proyecto_id } = schemas.get_public_url.parse(args);
    const { data, error } = await supa()
      .from("roadmap_tokens_publicos")
      .select("token")
      .eq("proyecto_id", proyecto_id)
      .eq("activo", true)
      .limit(1)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Sin token activo. Usá regenerate_public_link.");
    return ok({ url: publicUrl(data.token) });
  },
};

export const toolDefs = [
  {
    name: "list_clientes",
    description: "Lista todos los clientes Codexy. Filtros opcionales.",
    inputSchema: schemas.list_clientes,
  },
  {
    name: "get_roadmap",
    description: "Trae el roadmap completo de un cliente (proyecto + fases + items).",
    inputSchema: schemas.get_roadmap,
  },
  {
    name: "create_roadmap",
    description:
      "Crea un roadmap para un cliente desde una plantilla. Genera token público automáticamente.",
    inputSchema: schemas.create_roadmap,
  },
  {
    name: "add_fase",
    description: "Agrega una nueva fase a un proyecto existente.",
    inputSchema: schemas.add_fase,
  },
  {
    name: "update_fase",
    description: "Edita título, descripción o estado de una fase.",
    inputSchema: schemas.update_fase,
  },
  {
    name: "mark_fase_done",
    description:
      "Marca una fase como completada (por número de orden, no por UUID).",
    inputSchema: schemas.mark_fase_done,
  },
  {
    name: "mark_fase_active",
    description: "Marca una fase como 'en curso'.",
    inputSchema: schemas.mark_fase_active,
  },
  {
    name: "add_item",
    description: "Agrega un ítem/tarea a una fase.",
    inputSchema: schemas.add_item,
  },
  {
    name: "toggle_item",
    description:
      "Marca/desmarca un ítem como completado. Si no pasás 'completado', hace toggle.",
    inputSchema: schemas.toggle_item,
  },
  {
    name: "update_cliente",
    description: "Actualiza datos del cliente (nombre, empresa, email, teléfono, rubro).",
    inputSchema: schemas.update_cliente,
  },
  {
    name: "regenerate_public_link",
    description:
      "Rota el token público del roadmap. El link viejo deja de funcionar.",
    inputSchema: schemas.regenerate_public_link,
  },
  {
    name: "get_public_url",
    description: "Devuelve la URL pública actual del roadmap para compartir al cliente.",
    inputSchema: schemas.get_public_url,
  },
];
