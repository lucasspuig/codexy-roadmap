// Renderer minimalista de templates para los mensajes de WhatsApp.
//
// Soporta:
//   - Variables: {{cliente.nombre}}, {{cuota.monto_usd}}, etc. (acceso por path)
//   - Condicionales: {{#if cuota.tiene_ars}}...{{/if}}
//
// No usamos handlebars/mustache para mantener cero dependencias y máxima
// claridad. Los templates son cortos (mensajes WA) así que es suficiente.

export type TemplateContext = Record<string, unknown>;

export function renderTemplate(
  template: string,
  context: TemplateContext,
): string {
  // Primero resolvemos los #if (que pueden contener variables adentro)
  let out = renderConditionals(template, context);
  // Después las variables sueltas
  out = renderVariables(out, context);
  // Limpiar líneas vacías consecutivas (que quedan cuando se vacía un #if)
  out = collapseEmptyLines(out);
  return out;
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const IF_RE = /\{\{\s*#if\s+([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g;

function renderConditionals(input: string, ctx: TemplateContext): string {
  return input.replace(IF_RE, (_match, path: string, body: string) => {
    return isTruthy(getValueByPath(ctx, path)) ? body : "";
  });
}

function renderVariables(input: string, ctx: TemplateContext): string {
  return input.replace(VAR_RE, (_match, path: string) => {
    const v = getValueByPath(ctx, path);
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function collapseEmptyLines(s: string): string {
  return s
    .split("\n")
    .reduce<string[]>((acc, line) => {
      const trimmed = line.trim();
      if (trimmed === "" && acc.length > 0 && acc[acc.length - 1] === "") {
        return acc;
      }
      acc.push(trimmed === "" ? "" : line);
      return acc;
    }, [])
    .join("\n")
    .trim();
}

/**
 * Devuelve la lista de variables {{path}} que el template referencia, para
 * mostrar en la UI de edición.
 */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    found.add(m[1] ?? "");
  }
  for (const m of template.matchAll(IF_RE)) {
    found.add(m[1] ?? "");
  }
  found.delete("");
  return Array.from(found).sort();
}
