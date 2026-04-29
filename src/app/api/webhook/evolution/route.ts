/**
 * POST /api/webhook/evolution
 *
 * Webhook que Evolution API llama cuando llega un mensaje a la cuenta de
 * WhatsApp. Lo usamos para:
 *
 *   1. Registrar todos los mensajes entrantes en `mensajes_recibidos` (inbox).
 *   2. Auto-detectar comprobantes de pago: si el cliente está registrado, tiene
 *      cuota pendiente este mes y mandó una imagen o PDF → marca la cuota como
 *      pagada e inserta un row en `pagos`.
 *   3. Detectar postulantes (CV/curriculum) para no alertar al admin.
 *   4. Marcar consultas de clientes / desconocidos para que el admin las vea.
 *
 * Auth: el secret se compara contra WEBHOOK_SECRET (env var). Se acepta
 * via header `X-Webhook-Secret` O via query param `?secret=...`. Esto
 * último es porque la UI de Evolution API no expone campo de headers
 * custom — solo URL. Si no coincide, 401.
 *
 * Como el webhook es anónimo (Evolution no lleva sesión de usuario), usamos
 * el admin client (service_role) — bypassea RLS para insertar / actualizar
 * libremente.
 */

import { NextResponse, type NextRequest } from "next/server";

import { sendWhatsapp, normalizePhone } from "@/lib/evolution-api";
import { renderTemplate } from "@/lib/templates";
import { formatFechaCorta, formatUSD, periodoOf } from "@/lib/cuotas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del payload de Evolution API
// ─────────────────────────────────────────────────────────────────────────────

interface EvolutionMessageKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
}

interface EvolutionImageMessage {
  caption?: string;
  mimetype?: string;
  url?: string;
  mediaUrl?: string;
}

interface EvolutionDocumentMessage {
  fileName?: string;
  mimetype?: string;
  url?: string;
  mediaUrl?: string;
  caption?: string;
}

interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: EvolutionImageMessage;
  documentMessage?: EvolutionDocumentMessage;
  audioMessage?: { mimetype?: string; url?: string };
}

interface EvolutionData {
  key?: EvolutionMessageKey;
  message?: EvolutionMessageContent;
  messageTimestamp?: number;
  pushName?: string;
}

interface EvolutionPayload {
  event?: string;
  data?: EvolutionData;
}

type Categoria =
  | "comprobante_pago"
  | "consulta_cliente"
  | "postulante"
  | "desconocido";

// ─────────────────────────────────────────────────────────────────────────────
// Detección de categoría
// ─────────────────────────────────────────────────────────────────────────────

const POSTULANTE_FILE_RE = /(?:resume|cv|curriculum|portfolio)/i;
const POSTULANTE_BODY_RE =
  /(?:postulación|postulacion|vacante|currículum|curriculum|cv\b|trabajo en|puesto|aplicar a|me postulo)/i;

function detectarCategoria(input: {
  clienteMatched: boolean;
  body: string | null;
  hasAttachment: boolean;
  attachmentMime: string | null;
  attachmentName: string | null;
  tieneCuotaPendiente: boolean;
}): Categoria {
  const { clienteMatched, body, hasAttachment, attachmentMime, attachmentName } = input;

  const fileLooksPostulante =
    !!attachmentName && POSTULANTE_FILE_RE.test(attachmentName);
  const bodyLooksPostulante = !!body && POSTULANTE_BODY_RE.test(body);

  if (fileLooksPostulante || bodyLooksPostulante) {
    return "postulante";
  }

  if (clienteMatched && hasAttachment && input.tieneCuotaPendiente) {
    const isImage =
      typeof attachmentMime === "string" && attachmentMime.startsWith("image/");
    const isPdf = attachmentMime === "application/pdf";
    if (isImage || isPdf) {
      return "comprobante_pago";
    }
  }

  if (clienteMatched && !hasAttachment) {
    return "consulta_cliente";
  }
  if (clienteMatched && hasAttachment) {
    // Cliente con adjunto pero sin cuota pendiente → consulta normal
    return "consulta_cliente";
  }
  return "desconocido";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extrae el número de teléfono de un remoteJid tipo "5491131245678@s.whatsapp.net" */
function phoneFromJid(jid: string | undefined): string | null {
  if (!jid) return null;
  const at = jid.indexOf("@");
  const raw = at >= 0 ? jid.slice(0, at) : jid;
  return normalizePhone(raw);
}

/** Obtiene el cuerpo del mensaje del payload de Evolution. */
function extractBody(message: EvolutionMessageContent | undefined): string | null {
  if (!message) return null;
  if (typeof message.conversation === "string" && message.conversation.length > 0) {
    return message.conversation;
  }
  if (typeof message.extendedTextMessage?.text === "string") {
    return message.extendedTextMessage.text;
  }
  if (typeof message.imageMessage?.caption === "string" && message.imageMessage.caption.length > 0) {
    return message.imageMessage.caption;
  }
  if (typeof message.documentMessage?.caption === "string" && message.documentMessage.caption.length > 0) {
    return message.documentMessage.caption;
  }
  if (typeof message.documentMessage?.fileName === "string") {
    return message.documentMessage.fileName;
  }
  return null;
}

interface AdjuntoInfo {
  has: boolean;
  url: string | null;
  mime: string | null;
  name: string | null;
}

function extractAdjunto(message: EvolutionMessageContent | undefined): AdjuntoInfo {
  if (!message) return { has: false, url: null, mime: null, name: null };
  if (message.imageMessage) {
    return {
      has: true,
      url: message.imageMessage.url ?? message.imageMessage.mediaUrl ?? null,
      mime: message.imageMessage.mimetype ?? "image/jpeg",
      name: null,
    };
  }
  if (message.documentMessage) {
    return {
      has: true,
      url: message.documentMessage.url ?? message.documentMessage.mediaUrl ?? null,
      mime: message.documentMessage.mimetype ?? "application/octet-stream",
      name: message.documentMessage.fileName ?? null,
    };
  }
  return { has: false, url: null, mime: null, name: null };
}

interface ClienteRow {
  id: string;
  nombre: string;
  telefono: string | null;
}

/** Compara teléfonos por la cola de dígitos: ignora prefijos / +/91 etc. */
function matchClienteByPhone(
  clientes: ClienteRow[],
  phoneIn: string,
): ClienteRow | null {
  const target = phoneIn.replace(/\D/g, "");
  if (target.length === 0) return null;
  // Coincidencia exacta primero
  for (const c of clientes) {
    const t = (c.telefono ?? "").replace(/\D/g, "");
    if (t.length > 0 && t === target) return c;
  }
  // Coincidencia por sufijo (últimos 8 dígitos en común — mínimo razonable
  // sin matchear demasiado falsamente).
  for (const c of clientes) {
    const t = (c.telefono ?? "").replace(/\D/g, "");
    if (t.length < 8) continue;
    const tail = t.slice(-8);
    if (target.endsWith(tail) || t.endsWith(target.slice(-8))) {
      return c;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const expected = process.env.WEBHOOK_SECRET;
  const fromHeader = req.headers.get("x-webhook-secret");
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const provided = fromHeader || fromQuery;
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  let payload: EvolutionPayload;
  try {
    payload = (await req.json()) as EvolutionPayload;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: NO_STORE },
    );
  }

  const data = payload.data;
  if (!data) {
    return NextResponse.json(
      { ok: true, skipped: "no_data" },
      { status: 200, headers: NO_STORE },
    );
  }

  // Skip mensajes que mandamos nosotros mismos (echo).
  if (data.key?.fromMe === true) {
    return NextResponse.json(
      { ok: true, skipped: "from_me" },
      { status: 200, headers: NO_STORE },
    );
  }

  const phone = phoneFromJid(data.key?.remoteJid);
  if (!phone) {
    return NextResponse.json(
      { ok: true, skipped: "no_phone" },
      { status: 200, headers: NO_STORE },
    );
  }

  const body = extractBody(data.message);
  const adjunto = extractAdjunto(data.message);

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: "service_role_missing", detail: String(err) },
      { status: 500, headers: NO_STORE },
    );
  }

  // Match cliente por teléfono
  const { data: clientesRaw } = await admin
    .from("clientes")
    .select("id, nombre, telefono")
    .not("telefono", "is", null);
  const clientes = (clientesRaw as ClienteRow[] | null) ?? [];
  const cliente = matchClienteByPhone(clientes, phone);

  // ¿Cuota pendiente este mes para este cliente?
  const periodoActual = periodoOf(new Date());
  let cuotaPendiente: {
    id: string;
    contrato_id: string;
    monto_usd: number;
    periodo: string;
    fecha_vencimiento: string;
  } | null = null;

  if (cliente) {
    const { data: cuotaRows } = await admin
      .from("cuotas_mensuales")
      .select(
        "id, contrato_id, monto_usd, periodo, fecha_vencimiento, estado",
      )
      .eq("cliente_id", cliente.id)
      .in("estado", ["pendiente", "recordada_1", "recordada_2", "escalada"])
      .order("fecha_vencimiento", { ascending: true })
      .limit(5);
    const rows =
      (cuotaRows as Array<{
        id: string;
        contrato_id: string;
        monto_usd: number;
        periodo: string;
        fecha_vencimiento: string;
        estado: string;
      }> | null) ?? [];
    // Preferimos la cuota del período actual; si no hay, la más vieja pendiente.
    const delMes = rows.find((r) => r.periodo === periodoActual);
    const elegida = delMes ?? rows[0] ?? null;
    if (elegida) {
      cuotaPendiente = {
        id: elegida.id,
        contrato_id: elegida.contrato_id,
        monto_usd: Number(elegida.monto_usd ?? 0),
        periodo: elegida.periodo,
        fecha_vencimiento: elegida.fecha_vencimiento,
      };
    }
  }

  const categoria = detectarCategoria({
    clienteMatched: !!cliente,
    body,
    hasAttachment: adjunto.has,
    attachmentMime: adjunto.mime,
    attachmentName: adjunto.name,
    tieneCuotaPendiente: !!cuotaPendiente,
  });

  // Insert en mensajes_recibidos
  const requiereAtencion =
    categoria === "consulta_cliente" || categoria === "desconocido";

  const { data: insertedRow, error: insertErr } = await admin
    .from("mensajes_recibidos")
    .insert({
      telefono: phone,
      cliente_id: cliente?.id ?? null,
      cuerpo: body,
      tiene_adjunto: adjunto.has,
      adjunto_url: adjunto.url,
      adjunto_tipo: adjunto.mime,
      adjunto_nombre: adjunto.name,
      categoria,
      requiere_atencion: requiereAtencion,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: "insert_failed", detail: insertErr.message },
      { status: 500, headers: NO_STORE },
    );
  }

  const mensajeId = (insertedRow as { id: string } | null)?.id ?? null;

  // ─── Acción según categoría ────────────────────────────────────────────────

  if (categoria === "comprobante_pago" && cliente && cuotaPendiente && mensajeId) {
    // 1. Marcar la cuota como pagada
    const ahora = new Date().toISOString();
    await admin
      .from("cuotas_mensuales")
      .update({
        estado: "pagada",
        pagada_at: ahora,
      })
      .eq("id", cuotaPendiente.id);

    // 2. Insertar pago en la tabla de pagos
    const fechaHoy = ahora.slice(0, 10);
    const { data: pagoInserted } = await admin
      .from("pagos")
      .insert({
        cliente_id: cliente.id,
        contrato_id: cuotaPendiente.contrato_id,
        monto: cuotaPendiente.monto_usd,
        moneda: "USD",
        metodo: "transferencia",
        etapa: `Cuota ${cuotaPendiente.periodo}`,
        fecha_pago: fechaHoy,
        comprobante_url: adjunto.url,
        notas: "Detectado automáticamente desde WhatsApp",
        visible_cliente: true,
      })
      .select("id")
      .single();
    const pagoId = (pagoInserted as { id: string } | null)?.id ?? null;

    if (pagoId) {
      await admin
        .from("cuotas_mensuales")
        .update({ pago_id: pagoId })
        .eq("id", cuotaPendiente.id);
    }

    // 3. Actualizar el mensaje recibido
    await admin
      .from("mensajes_recibidos")
      .update({
        procesado_at: ahora,
        procesado_accion: "cuota_pagada",
      })
      .eq("id", mensajeId);

    // 4. Mandar confirmación por WhatsApp
    if (cliente.telefono) {
      const { data: tplRow } = await admin
        .from("mensaje_templates")
        .select("cuerpo")
        .eq("id", "pago_recibido")
        .eq("activo", true)
        .maybeSingle();
      const cuerpoTpl =
        (tplRow as { cuerpo: string } | null)?.cuerpo ??
        "¡Gracias {{cliente.nombre}}! Recibimos tu pago de USD {{cuota.monto_usd}} correspondiente a {{cuota.periodo}}. Saludos del equipo Codexy.";
      const ctx = {
        cliente: { nombre: cliente.nombre },
        cuota: {
          monto_usd: formatUSD(cuotaPendiente.monto_usd),
          periodo: cuotaPendiente.periodo,
          vencimiento_largo: formatFechaCorta(cuotaPendiente.fecha_vencimiento),
        },
      };
      const cuerpoFinal = renderTemplate(cuerpoTpl, ctx);
      const sendRes = await sendWhatsapp({
        telefono: cliente.telefono,
        mensaje: cuerpoFinal,
      });

      await admin.from("mensajes_enviados").insert({
        cliente_id: cliente.id,
        cuota_id: cuotaPendiente.id,
        template_id: "pago_recibido",
        telefono_destino:
          normalizePhone(cliente.telefono) ?? cliente.telefono,
        cuerpo: cuerpoFinal,
        estado: sendRes.ok ? "enviado" : "fallido",
        error: sendRes.error ?? null,
        evolution_response: (sendRes.payload as object) ?? null,
      });
    }
  } else if (categoria === "postulante" && mensajeId) {
    // Postulante: marcar como procesado, no requiere acción del admin
    await admin
      .from("mensajes_recibidos")
      .update({
        procesado_at: new Date().toISOString(),
        procesado_accion: "postulante_archivado",
        requiere_atencion: false,
      })
      .eq("id", mensajeId);
  }
  // consulta_cliente / desconocido: requiere_atencion=true ya quedó seteado

  // ── Notificación al admin (numero_escalacion) ────────────────────────────
  // Disparamos un WA a tu número personal cuando:
  //   - Se confirmó un pago (queremos saber al instante quién pagó)
  //   - Un cliente registrado mandó un mensaje fuera de flujo
  //     (consulta, baja, queja — algo que no es un comprobante)
  //   - Un número desconocido escribió (potencial lead o spam)
  // Postulantes intencionalmente NO disparan notif.
  await notificarAdminSiCorresponde({
    admin,
    categoria,
    cliente,
    cuotaPendiente,
    body,
    phone,
  });

  return NextResponse.json(
    {
      ok: true,
      mensaje_id: mensajeId,
      categoria,
      cliente_id: cliente?.id ?? null,
    },
    { status: 200, headers: NO_STORE },
  );
}

/**
 * Centraliza la lógica de notificar a tu número personal cuando algo
 * relevante pasa en el WhatsApp del bot. No bloquea la respuesta del
 * webhook si el envío falla — solo logueamos.
 */
async function notificarAdminSiCorresponde(input: {
  admin: ReturnType<typeof createAdminClient>;
  categoria: string;
  cliente: ClienteRow | null;
  cuotaPendiente: {
    monto_usd: number;
    periodo: string;
  } | null;
  body: string | null;
  phone: string;
}): Promise<void> {
  const { admin, categoria, cliente, cuotaPendiente, body, phone } = input;

  // Solo notificamos en estos 3 casos
  let templateId: string | null = null;
  if (categoria === "comprobante_pago" && cliente && cuotaPendiente) {
    templateId = "notif_admin_pago_recibido";
  } else if (categoria === "consulta_cliente" && cliente) {
    templateId = "notif_admin_mensaje_cliente";
  } else if (categoria === "desconocido") {
    templateId = "notif_admin_mensaje_desconocido";
  }
  if (!templateId) return;

  // Leemos número de escalación + template en paralelo
  const [agencyRes, tplRes, clienteFullRes] = await Promise.all([
    admin
      .from("agency_payment_data")
      .select("numero_escalacion")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("mensaje_templates")
      .select("cuerpo, activo")
      .eq("id", templateId)
      .maybeSingle(),
    cliente
      ? admin
          .from("clientes")
          .select("nombre, empresa, telefono")
          .eq("id", cliente.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const numeroAdmin =
    (agencyRes.data as { numero_escalacion?: string | null } | null)
      ?.numero_escalacion ?? null;
  const tpl = tplRes.data as { cuerpo: string; activo: boolean } | null;
  const clienteFull = clienteFullRes.data as
    | { nombre: string; empresa: string | null; telefono: string | null }
    | null;

  if (!numeroAdmin) return;
  if (!tpl || !tpl.activo) return;

  // Construir contexto para el template
  const telefonoCli =
    clienteFull?.telefono ?? cliente?.telefono ?? null;
  const ctx: Record<string, unknown> = {
    cliente: {
      nombre: clienteFull?.nombre ?? cliente?.nombre ?? "—",
      empresa: clienteFull?.empresa ?? "",
      telefono: telefonoCli ?? "",
      telefono_link: telefonoCli
        ? `https://wa.me/${normalizePhone(telefonoCli) ?? ""}`
        : "",
    },
    cuota: cuotaPendiente
      ? {
          monto_usd: formatUSD(cuotaPendiente.monto_usd),
          periodo: cuotaPendiente.periodo,
        }
      : { monto_usd: "—", periodo: "—" },
    mensaje: {
      texto: body && body.trim().length > 0 ? body.trim() : "(sin texto)",
    },
    telefono: {
      formato: phone,
    },
  };

  const cuerpoFinal = renderTemplate(tpl.cuerpo, ctx);
  const sendRes = await sendWhatsapp({
    telefono: numeroAdmin,
    mensaje: cuerpoFinal,
  });

  await admin.from("mensajes_enviados").insert({
    cliente_id: cliente?.id ?? null,
    cuota_id: null,
    template_id: templateId,
    telefono_destino: normalizePhone(numeroAdmin) ?? numeroAdmin,
    cuerpo: cuerpoFinal,
    estado: sendRes.ok ? "enviado" : "fallido",
    error: sendRes.error ?? null,
    evolution_response: (sendRes.payload as object) ?? null,
  });
}
