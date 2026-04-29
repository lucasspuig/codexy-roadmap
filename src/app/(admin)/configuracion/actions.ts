"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sendWhatsapp } from "@/lib/evolution-api";
import type { Profile } from "@/types/database";

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

// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico WhatsApp: mensaje de prueba al numero_escalacion
// ─────────────────────────────────────────────────────────────────────────────

export async function enviarMensajeTest(): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("agency_payment_data")
    .select("numero_escalacion")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const telefono = ((row as { numero_escalacion: string | null } | null)
    ?.numero_escalacion ?? "")
    .trim();
  if (!telefono) {
    return {
      ok: false,
      error: "Configurá tu número personal en Datos de pago",
    };
  }

  const ahora = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "short",
  });
  const mensaje =
    `✅ Mensaje de prueba desde Codexy.\n\n` +
    `Si recibiste esto, la integración con Evolution API está funcionando correctamente.\n\n` +
    `Hora del envío: ${ahora}`;

  const result = await sendWhatsapp({ telefono, mensaje });
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Envío fallido" };
  }
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates de mensajes (mensaje_templates)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateTemplate(input: {
  id: string;
  cuerpo: string;
}): Promise<ActionResult<null>> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const cuerpo = String(input.cuerpo ?? "");
  if (cuerpo.length < 1 || cuerpo.length > 5000) {
    return {
      ok: false,
      error: "El cuerpo debe tener entre 1 y 5000 caracteres",
    };
  }
  if (!input.id || typeof input.id !== "string") {
    return { ok: false, error: "Template id inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("mensaje_templates")
    .update({
      cuerpo,
      updated_at: new Date().toISOString(),
      updated_by: guard.userId,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracion");
  return { ok: true, data: null };
}
