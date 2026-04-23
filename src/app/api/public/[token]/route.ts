import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Cliente,
  RoadmapEvento,
  RoadmapFase,
  RoadmapItem,
  RoadmapProyecto,
  RoadmapTokenPublico,
} from "@/types/database";

/** Token se compone de exactamente 64 caracteres hex (randomBytes(32).toString("hex")). */
const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Rate limiter básico en memoria — 1 request/segundo por IP. */
type Bucket = { count: number; windowStart: number };
const bucket = new Map<string, Bucket>();
const RATE_WINDOW_MS = 1_000;
const RATE_LIMIT = 2; // hasta 2 reqs por segundo para tolerar retries

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = bucket.get(ip);
  if (!b || now - b.windowStart > RATE_WINDOW_MS) {
    bucket.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= RATE_LIMIT) return false;
  b.count += 1;
  return true;
}

/** Shape pública del payload — sólo campos que el cliente puede ver. */
export type PublicPayload = {
  cliente: Pick<Cliente, "nombre" | "empresa">;
  proyecto: Pick<
    RoadmapProyecto,
    "nombre" | "subtitulo" | "fecha_inicio" | "fecha_estimada_fin" | "estado"
  >;
  fases: Array<
    Pick<
      RoadmapFase,
      "id" | "orden" | "icono" | "titulo" | "descripcion" | "estado" | "completada_at" | "updated_at"
    > & { items: Array<Pick<RoadmapItem, "id" | "orden" | "texto" | "completado" | "completado_at">> }
  >;
  eventos: Array<Pick<RoadmapEvento, "id" | "fase_id" | "tipo" | "mensaje" | "created_at">>;
  ultima_actualizacion: string;
};

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * GET /api/public/[token]
 * No requiere autenticación. El token es el único gate.
 * Devuelve el estado actual del roadmap sin filtrar datos internos.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  // Validación formato del token (evita lookups innecesarios a la DB).
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "1" } },
    );
  }

  try {
    const data = await loadPublicRoadmap(token);
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(data, { status: 200, headers: NO_STORE });
  } catch (err) {
    // No filtramos detalles del error al cliente.
    console.error("[public-roadmap:GET] error", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: NO_STORE },
    );
  }
}

/**
 * Core loader — usado por la API y por el Server Component de la página.
 * Retorna null si el token no existe, está inactivo o expiró.
 */
export async function loadPublicRoadmap(
  token: string,
  opts: { touch?: boolean } = {},
): Promise<PublicPayload | null> {
  const supa = createAdminClient();

  const { data: tokenRow, error: tokenErr } = await supa
    .from("roadmap_tokens_publicos")
    .select("token, proyecto_id, activo, expires_at, access_count")
    .eq("token", token)
    .eq("activo", true)
    .maybeSingle<RoadmapTokenPublico>();

  if (tokenErr || !tokenRow) return null;
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return null;
  }

  // Fire-and-forget bump del contador de accesos. Best-effort, no bloquea la respuesta.
  if (opts.touch !== false) {
    const patch: Partial<RoadmapTokenPublico> = {
      last_accessed_at: new Date().toISOString(),
      access_count: (tokenRow.access_count ?? 0) + 1,
    };
    void (supa.from("roadmap_tokens_publicos") as unknown as {
      update: (v: Partial<RoadmapTokenPublico>) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    })
      .update(patch)
      .eq("token", token)
      .then(({ error }) => {
        if (error) console.warn("[public-roadmap:touch] error", error.message);
      });
  }

  const proyectoId = tokenRow.proyecto_id;

  // Proyecto (sin pm_id, notas_internas ni timestamps internos innecesarios).
  const { data: proyecto } = await supa
    .from("roadmap_proyectos")
    .select("cliente_id, nombre, subtitulo, fecha_inicio, fecha_estimada_fin, estado, updated_at")
    .eq("id", proyectoId)
    .maybeSingle<
      Pick<
        RoadmapProyecto,
        | "cliente_id"
        | "nombre"
        | "subtitulo"
        | "fecha_inicio"
        | "fecha_estimada_fin"
        | "estado"
        | "updated_at"
      >
    >();

  if (!proyecto) return null;

  const [clienteRes, fasesRes] = await Promise.all([
    supa
      .from("clientes")
      .select("nombre, empresa")
      .eq("id", proyecto.cliente_id)
      .maybeSingle<Pick<Cliente, "nombre" | "empresa">>(),
    supa
      .from("roadmap_fases")
      .select(
        "id, orden, icono, titulo, descripcion, estado, completada_at, updated_at",
      )
      .eq("proyecto_id", proyectoId)
      .order("orden", { ascending: true }),
  ]);

  const cliente = clienteRes.data ?? { nombre: "Cliente", empresa: null };
  const fasesRaw = (fasesRes.data ?? []) as Array<
    Pick<
      RoadmapFase,
      "id" | "orden" | "icono" | "titulo" | "descripcion" | "estado" | "completada_at" | "updated_at"
    >
  >;

  const faseIds = fasesRaw.map((f) => f.id);

  // Cargar items y eventos en paralelo.
  const [itemsRes, eventosRes] = await Promise.all([
    faseIds.length
      ? supa
          .from("roadmap_items")
          .select("id, fase_id, orden, texto, completado, completado_at")
          .in("fase_id", faseIds)
          .order("orden", { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    supa
      .from("roadmap_eventos")
      .select("id, fase_id, tipo, mensaje, created_at")
      .eq("proyecto_id", proyectoId)
      .eq("visible_cliente", true)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const itemsByFase = new Map<
    string,
    Array<Pick<RoadmapItem, "id" | "orden" | "texto" | "completado" | "completado_at">>
  >();
  for (const it of (itemsRes.data ?? []) as Array<
    Pick<RoadmapItem, "id" | "fase_id" | "orden" | "texto" | "completado" | "completado_at">
  >) {
    const arr = itemsByFase.get(it.fase_id) ?? [];
    arr.push({
      id: it.id,
      orden: it.orden,
      texto: it.texto,
      completado: it.completado,
      completado_at: it.completado_at,
    });
    itemsByFase.set(it.fase_id, arr);
  }

  const fases = fasesRaw.map((f) => ({
    ...f,
    items: itemsByFase.get(f.id) ?? [],
  }));

  const eventos = (eventosRes.data ?? []) as PublicPayload["eventos"];

  // "ultima_actualizacion" = la más reciente entre proyecto/fase/evento, como heurística para el chip.
  const candidatos: string[] = [proyecto.updated_at];
  for (const f of fasesRaw) candidatos.push(f.updated_at);
  const firstEvento = eventos[0];
  if (firstEvento) candidatos.push(firstEvento.created_at);
  const ultima_actualizacion =
    candidatos.filter(Boolean).sort().slice(-1)[0] ?? new Date().toISOString();

  return {
    cliente: { nombre: cliente.nombre, empresa: cliente.empresa ?? null },
    proyecto: {
      nombre: proyecto.nombre,
      subtitulo: proyecto.subtitulo,
      fecha_inicio: proyecto.fecha_inicio,
      fecha_estimada_fin: proyecto.fecha_estimada_fin,
      estado: proyecto.estado,
    },
    fases,
    eventos,
    ultima_actualizacion,
  };
}
