"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";
import type { Contrato } from "@/types/contratos";
import type { Pago, PagoMetodo } from "@/types/pagos";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const ALLOWED_METODOS: ReadonlySet<PagoMetodo> = new Set([
  "transferencia",
  "efectivo",
  "mercadopago",
  "tarjeta",
  "cripto",
  "otro",
]);

const ALLOWED_COMPROBANTE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

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

// ─────────────────────────────────────────────────────────────────────────────
// CRUD de pagos
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePagoInput {
  contrato_id: string;
  fecha_pago: string; // ISO date YYYY-MM-DD
  monto: number;
  moneda?: string;
  metodo?: PagoMetodo | null;
  etapa?: string | null;
  comprobante_url?: string | null;
  notas?: string | null;
  visible_cliente?: boolean;
}

export async function createPago(
  input: CreatePagoInput,
): Promise<ActionResult<{ id: string }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, error: "Monto inválido" };
  }
  if (input.metodo && !ALLOWED_METODOS.has(input.metodo)) {
    return { ok: false, error: "Método de pago inválido" };
  }

  const supabase = await createClient();

  // Resolver el cliente_id desde el contrato (denormalizado por seguridad)
  const { data: contRow } = await supabase
    .from("contratos")
    .select("cliente_id, moneda")
    .eq("id", input.contrato_id)
    .single();
  const cont = contRow as { cliente_id: string; moneda: string } | null;
  if (!cont) return { ok: false, error: "Contrato no encontrado" };

  const { data, error } = await supabase
    .from("pagos")
    .insert({
      contrato_id: input.contrato_id,
      cliente_id: cont.cliente_id,
      fecha_pago: input.fecha_pago,
      monto: input.monto,
      moneda: input.moneda ?? cont.moneda ?? "USD",
      metodo: input.metodo ?? null,
      etapa: input.etapa ?? null,
      comprobante_url: input.comprobante_url ?? null,
      notas: input.notas ?? null,
      visible_cliente: input.visible_cliente ?? true,
      created_by: guard.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updatePago(input: {
  id: string;
  patch: Partial<CreatePagoInput>;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  if (
    input.patch.monto !== undefined &&
    (!Number.isFinite(input.patch.monto) || input.patch.monto <= 0)
  ) {
    return { ok: false, error: "Monto inválido" };
  }
  if (input.patch.metodo && !ALLOWED_METODOS.has(input.patch.metodo)) {
    return { ok: false, error: "Método de pago inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pagos")
    .update({
      ...input.patch,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function deletePago(input: {
  id: string;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { error } = await supabase.from("pagos").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listados
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista todos los contratos (no borrador/cancelado) y todos los pagos del
 * cliente. La UI calcula los saldos a partir de esto.
 */
export async function listFinanzasByCliente(input: {
  cliente_id: string;
}): Promise<ActionResult<{ contratos: Contrato[]; pagos: Pago[] }>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();

  const [{ data: contRows, error: contErr }, { data: pagoRows, error: pagoErr }] =
    await Promise.all([
      supabase
        .from("contratos")
        .select("*")
        .eq("cliente_id", input.cliente_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("pagos")
        .select("*")
        .eq("cliente_id", input.cliente_id)
        .order("fecha_pago", { ascending: false }),
    ]);

  if (contErr) return { ok: false, error: contErr.message };
  if (pagoErr) return { ok: false, error: pagoErr.message };

  return {
    ok: true,
    data: {
      contratos: (contRows as unknown as Contrato[]) ?? [],
      pagos: (pagoRows as unknown as Pago[]) ?? [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload de comprobante
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadComprobante(formData: FormData): Promise<
  ActionResult<{ url: string }>
> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  const contratoId = String(formData.get("contrato_id") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "Archivo no recibido" };
  if (!ALLOWED_COMPROBANTE_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Formato no soportado (PNG/JPG/WEBP/PDF)",
    };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "El comprobante supera 5 MB" };
  }
  if (!contratoId) return { ok: false, error: "Falta contrato_id" };

  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
  const path = `comprobantes/${contratoId}/${Date.now()}.${ext}`;

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      ok: false,
      error: `Config server: ${err instanceof Error ? err.message : "error"}`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("contratos-firmas")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = admin.storage
    .from("contratos-firmas")
    .getPublicUrl(path);

  return { ok: true, data: { url: pub.publicUrl } };
}
