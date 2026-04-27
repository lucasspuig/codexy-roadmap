"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient as createAnonSupabase } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import type {
  AgencySettings,
  Contrato,
  ContratoEstado,
  ContratoModalidad,
  ContratoPagoDetalle,
  ContratoTipo,
} from "@/types/contratos";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function assertAdmin(): Promise<
  | { ok: true; userId: string; profile: Pick<Profile, "id" | "nombre" | "email" | "role" | "activo"> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, activo")
    .eq("id", user.id)
    .single();
  const profile = data as Pick<
    Profile,
    "id" | "nombre" | "email" | "role" | "activo"
  > | null;
  if (!profile?.activo) return { ok: false, error: "Cuenta inactiva" };
  return { ok: true, userId: user.id, profile };
}

function tokenHex(): string {
  return randomBytes(32).toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD de contratos
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateContratoInput {
  cliente_id: string;
  proyecto_id?: string | null;
  tipo: ContratoTipo;
  servicio_titulo: string;
  servicio_descripcion?: string;
  alcance_items?: string[];
  alcance_excluye?: string[];
  plazo_implementacion?: string;
  monto_total: number;
  moneda?: string;
  modalidad_pago: ContratoModalidad;
  detalle_pagos?: ContratoPagoDetalle[];
  mantenimiento_mensual?: number | null;
  mora_porcentaje?: number | null;
  dias_gracia?: number | null;
  notas_internas?: string;
}

export async function createContrato(
  input: CreateContratoInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  // Generar numero único usando la function de Postgres
  const { data: numData, error: numErr } = await supabase.rpc(
    "generate_contrato_numero" as never,
  );
  if (numErr) return { ok: false, error: numErr.message };
  const numero = (numData as unknown as string) ?? `CTX-${new Date().getFullYear()}-001`;

  const insertData = {
    numero,
    cliente_id: input.cliente_id,
    proyecto_id: input.proyecto_id ?? null,
    tipo: input.tipo,
    estado: "borrador" as const,
    servicio_titulo: input.servicio_titulo,
    servicio_descripcion: input.servicio_descripcion ?? null,
    alcance_items: input.alcance_items ?? [],
    alcance_excluye: input.alcance_excluye ?? [],
    plazo_implementacion: input.plazo_implementacion ?? null,
    monto_total: input.monto_total,
    moneda: input.moneda ?? "USD",
    modalidad_pago: input.modalidad_pago,
    detalle_pagos: input.detalle_pagos ?? [],
    mantenimiento_mensual: input.mantenimiento_mensual ?? null,
    mora_porcentaje: input.mora_porcentaje ?? null,
    dias_gracia: input.dias_gracia ?? null,
    notas_internas: input.notas_internas ?? null,
    created_by: guard.userId,
  };

  const { data, error } = await supabase
    .from("contratos")
    .insert(insertData)
    .select("id, numero")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proyectos/${input.proyecto_id ?? ""}`);
  return { ok: true, data: { id: data.id as string, numero: data.numero as string } };
}

export async function updateContrato(input: {
  id: string;
  patch: Partial<CreateContratoInput>;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase
    .from("contratos")
    .update(input.patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: null };
}

export async function deleteContrato(input: {
  id: string;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  // Solo permite borrar borradores
  const { data: c } = await supabase
    .from("contratos")
    .select("estado, proyecto_id")
    .eq("id", input.id)
    .single();
  const row = c as { estado: ContratoEstado; proyecto_id: string | null } | null;
  if (!row) return { ok: false, error: "Contrato no encontrado" };
  if (row.estado !== "borrador") {
    return {
      ok: false,
      error: "Solo se pueden eliminar contratos en borrador. Cancelalo si ya fue emitido.",
    };
  }

  const { error } = await supabase.from("contratos").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  if (row.proyecto_id) revalidatePath(`/proyectos/${row.proyecto_id}`);
  return { ok: true, data: null };
}

/**
 * Emite el contrato: lock + token público + auto-firma de Codexy.
 * Una vez emitido, no se puede editar contenido (trigger DB lo bloquea).
 */
export async function emitirContrato(input: {
  id: string;
}): Promise<ActionResult<{ token: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  // Validar que la agencia tenga firma configurada
  const { data: agencyRow } = await supabase
    .from("agency_settings")
    .select("signature_url, signatory_name")
    .eq("id", 1)
    .single();
  const agency = agencyRow as Pick<
    AgencySettings,
    "signature_url" | "signatory_name"
  > | null;
  if (!agency?.signature_url) {
    return {
      ok: false,
      error:
        "Antes de emitir un contrato, configurá la firma de Codexy en /configuracion",
    };
  }

  const { data: c0 } = await supabase
    .from("contratos")
    .select("estado")
    .eq("id", input.id)
    .single();
  const contratoActual = c0 as { estado: ContratoEstado } | null;
  if (!contratoActual) return { ok: false, error: "Contrato no encontrado" };
  if (contratoActual.estado !== "borrador") {
    return { ok: false, error: "Solo se puede emitir un contrato en borrador" };
  }

  const token = tokenHex();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("contratos")
    .update({
      estado: "enviado" as const,
      token_publico: token,
      fecha_emision: now.slice(0, 10),
      fecha_envio_cliente: now,
      fecha_firma_prestador: now,
      firma_prestador_url: agency.signature_url,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { token } };
}

export async function cancelarContrato(input: {
  id: string;
  motivo?: string;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = await createClient();
  const { error } = await supabase
    .from("contratos")
    .update({
      estado: "cancelado",
      notas_internas: input.motivo ? `[Cancelado] ${input.motivo}` : undefined,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Firma del cliente (vía página pública con token)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Firma del cliente. NO usa service_role: llama a un RPC SECURITY DEFINER
 * (sign_contrato_publico) que valida el token, guarda la firma como data
 * URL inline, y marca el contrato como firmado_completo.
 *
 * Recibe la firma como string (data URL data:image/png;base64,...) en lugar
 * de un File para evitar dependencia con el storage (que requiere admin
 * para uploads de usuarios anon).
 */
export async function firmarContratoCliente(input: {
  token: string;
  firma_data_url: string;
  ip?: string | null;
  ua?: string | null;
}): Promise<ActionResult<{ estado: ContratoEstado }>> {
  const token = String(input.token || "").trim();
  const firma = String(input.firma_data_url || "");

  if (!token || token.length < 32)
    return { ok: false, error: "Token inválido" };
  if (!firma.startsWith("data:image/")) {
    return { ok: false, error: "Firma inválida" };
  }
  if (firma.length > 250_000) {
    return { ok: false, error: "Firma demasiado grande" };
  }

  // Cliente anon (sin cookies). El RPC es SECURITY DEFINER y valida el
  // token internamente — no necesita auth de usuario.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, error: "Configuración del servidor incompleta" };
  }
  const anon = createAnonSupabase(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await anon.rpc("sign_contrato_publico" as never, {
    p_token: token,
    p_firma_data_url: firma,
    p_ip: input.ip ?? null,
    p_ua: input.ua ?? null,
  } as never);

  if (error) {
    return { ok: false, error: error.message };
  }
  void data;
  return { ok: true, data: { estado: "firmado_completo" } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agency settings (firma de Codexy)
// ─────────────────────────────────────────────────────────────────────────────

export async function getAgencySettings(): Promise<
  ActionResult<AgencySettings>
> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as AgencySettings };
}

export async function updateAgencySettings(input: {
  legal_name?: string;
  signatory_name?: string | null;
  signatory_role?: string | null;
  contact_email?: string | null;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const patch: Record<string, unknown> = { updated_by: guard.userId };
  if (input.legal_name !== undefined) patch.legal_name = input.legal_name;
  if (input.signatory_name !== undefined) patch.signatory_name = input.signatory_name;
  if (input.signatory_role !== undefined) patch.signatory_role = input.signatory_role;
  if (input.contact_email !== undefined) patch.contact_email = input.contact_email;

  const supabase = await createClient();
  const { error } = await supabase.from("agency_settings").update(patch).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/configuracion");
  return { ok: true, data: null };
}

export async function uploadAgencySignature(formData: FormData): Promise<
  ActionResult<{ url: string }>
> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Archivo no recibido" };
  if (!ALLOWED_FIRMA_MIME.has(file.type)) {
    return { ok: false, error: "Solo PNG/JPG/WEBP. Recomendado: PNG transparente." };
  }
  if (file.size > 1_048_576) return { ok: false, error: "Firma supera 1 MB" };

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `agency/firma-codexy-${Date.now()}.${ext}`;

  // Usamos el cliente regular: las storage policies del bucket
  // contratos-firmas ya permiten escribir/borrar a profiles activos.
  // Antes esto usaba admin (service_role) y rompía si la key estaba mal.
  const supabase = await createClient();

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from("contratos-firmas")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = supabase.storage
    .from("contratos-firmas")
    .getPublicUrl(path);
  const url = pub.publicUrl;

  // Borrar firmas antiguas en agency/ para mantener storage limpio
  const { data: list } = await supabase.storage
    .from("contratos-firmas")
    .list("agency", { limit: 50 });
  if (list && list.length > 1) {
    const current = path.split("/").pop();
    const toDelete = list
      .filter((f) => f.name !== current)
      .map((f) => `agency/${f.name}`);
    if (toDelete.length > 0) {
      await supabase.storage.from("contratos-firmas").remove(toDelete);
    }
  }

  const { error: updErr } = await supabase
    .from("agency_settings")
    .update({ signature_url: url, updated_by: guard.userId })
    .eq("id", 1);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/configuracion");
  return { ok: true, data: { url } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────

export async function listContratosByCliente(input: {
  cliente_id: string;
}): Promise<ActionResult<Contrato[]>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contratos")
    .select("*")
    .eq("cliente_id", input.cliente_id)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as unknown as Contrato[]) ?? [] };
}
