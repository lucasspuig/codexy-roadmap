// Wrapper para Evolution API — envío de WhatsApp.
//
// Configuración (env vars):
//   EVOLUTION_API_URL      → ej: https://evolution.tudominio.com
//   EVOLUTION_API_KEY      → API key del servidor de Evolution
//   EVOLUTION_INSTANCE     → nombre de la instance conectada al WA business
//
// Si alguna falta, sendWhatsapp devuelve un resultado fallido pero NO lanza
// excepción — así el cron sigue funcionando aunque la integración esté
// pendiente de configurar.

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
  payload?: unknown;
}

export async function sendWhatsapp(input: {
  telefono: string;        // formato internacional sin '+' (ej: 5491131245678)
  mensaje: string;
  delay?: number;          // ms de pausa que Evolution simula (humanización)
}): Promise<SendResult> {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    return {
      ok: false,
      error:
        "Evolution API no configurada (faltan EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE)",
    };
  }

  const phone = normalizePhone(input.telefono);
  if (!phone) return { ok: false, error: "Teléfono inválido" };

  const url = `${baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: input.mensaje,
        delay: input.delay ?? 1200,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: extractErrorMessage(payload) ?? `HTTP ${res.status}`,
        payload,
      };
    }

    return { ok: true, status: res.status, payload };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error desconocido al contactar Evolution API",
    };
  }
}

/** Normaliza un teléfono al formato que Evolution acepta (solo dígitos). */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.message === "string") return p.message;
  if (typeof p.error === "string") return p.error;
  if (Array.isArray(p.message) && p.message.length > 0) {
    return String(p.message[0]);
  }
  return null;
}
