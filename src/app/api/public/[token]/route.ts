import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type {
  Cliente,
  RoadmapEvento,
  RoadmapFase,
  RoadmapItem,
  RoadmapProyecto,
} from "@/types/database";

/** Token se compone de exactamente 64 caracteres hex (randomBytes(32).toString("hex")). */
const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Rate limiter básico en memoria — 2 requests/segundo por IP. */
type Bucket = { count: number; windowStart: number };
const bucket = new Map<string, Bucket>();
const RATE_WINDOW_MS = 1_000;
const RATE_LIMIT = 2;

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

/** Cliente anon dedicado (sin cookies/sesión) para llamar al RPC público. */
function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * GET /api/public/[token]
 * No requiere autenticación. El token es el único gate.
 * Llama al RPC get_public_roadmap (SECURITY DEFINER) que valida el token y
 * retorna los datos del roadmap en una sola query atómica.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

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
export async function loadPublicRoadmap(token: string): Promise<PublicPayload | null> {
  const supa = anonClient();
  const { data, error } = await supa.rpc("get_public_roadmap" as never, { p_token: token } as never);
  if (error) {
    console.error("[public-roadmap:rpc] error", error);
    return null;
  }
  if (!data) return null;

  const payload = data as {
    cliente: { nombre: string; empresa: string | null };
    proyecto: {
      id: string;
      nombre: string;
      subtitulo: string | null;
      estado: RoadmapProyecto["estado"];
      fecha_inicio: string;
      fecha_estimada_fin: string | null;
      updated_at: string;
    };
    fases: Array<{
      id: string;
      orden: number;
      icono: string | null;
      titulo: string;
      descripcion: string;
      estado: RoadmapFase["estado"];
      completada_at: string | null;
      updated_at: string;
      items: Array<{
        id: string;
        orden: number;
        texto: string;
        completado: boolean;
        completado_at: string | null;
      }>;
    }>;
    eventos: Array<{
      id: string;
      tipo: string;
      mensaje: string | null;
      created_at: string;
      fase_id?: string | null;
    }>;
    ultima_actualizacion: string;
  };

  return {
    cliente: { nombre: payload.cliente.nombre, empresa: payload.cliente.empresa ?? null },
    proyecto: {
      nombre: payload.proyecto.nombre,
      subtitulo: payload.proyecto.subtitulo,
      fecha_inicio: payload.proyecto.fecha_inicio,
      fecha_estimada_fin: payload.proyecto.fecha_estimada_fin,
      estado: payload.proyecto.estado,
    },
    fases: payload.fases.map((f) => ({
      id: f.id,
      orden: f.orden,
      icono: f.icono,
      titulo: f.titulo,
      descripcion: f.descripcion,
      estado: f.estado,
      completada_at: f.completada_at,
      updated_at: f.updated_at,
      items: f.items,
    })),
    eventos: payload.eventos.map((e) => ({
      id: e.id,
      fase_id: e.fase_id ?? null,
      tipo: e.tipo,
      mensaje: e.mensaje,
      created_at: e.created_at,
    })),
    ultima_actualizacion: payload.ultima_actualizacion,
  };
}
