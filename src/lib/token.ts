import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Genera un token aleatorio para acceso público al roadmap.
 * Se guarda en DB como primary key, NO se firma con HMAC porque es un lookup directo.
 * El secreto ROADMAP_TOKEN_SECRET se usa solo para validaciones adicionales (signed links).
 */
export function generatePublicToken(): string {
  // 32 bytes = 64 chars hex, ~10^77 combinaciones, imposible de adivinar.
  return randomBytes(32).toString("hex");
}

/**
 * Firma un payload simple (ej: token + timestamp) para links con expiración.
 * Útil si querés mandar links temporales por email sin tocar DB cada vez.
 */
export function signPayload(payload: string): string {
  const secret = process.env.ROADMAP_TOKEN_SECRET;
  if (!secret) throw new Error("Falta ROADMAP_TOKEN_SECRET");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.ROADMAP_TOKEN_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
