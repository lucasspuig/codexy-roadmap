import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supa: SupabaseClient | null = null;

/** Cliente singleton con service_role — bypasea RLS. Solo server. */
export function supa(): SupabaseClient {
  if (_supa) return _supa;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del MCP",
    );
  }
  _supa = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supa;
}

/** Genera un token hex aleatorio de 64 chars (32 bytes). */
export function generateTokenHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
