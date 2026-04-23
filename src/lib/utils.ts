import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "hace instantes";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Construye la URL pública del roadmap a partir del token.
 * Usa NEXT_PUBLIC_APP_URL como base; si no está definida, cae al origen actual (browser)
 * o a una cadena relativa en server.
 */
export function getPublicUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/r/${token}`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/r/${token}`;
  }
  return `/r/${token}`;
}
