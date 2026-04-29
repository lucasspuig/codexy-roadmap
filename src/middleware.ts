import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Excluye:
     * - /r/[token] (vista pública del cliente — roadmap)
     * - /c/[token] (vista pública del cliente — contrato a firmar)
     * - /pagar/[token] (vista pública de cobros)
     * - /api/public/* (endpoints públicos con token)
     * - /api/webhook/* (webhooks de servicios externos)
     * - /api/cron/* (cron endpoints autenticados con CRON_SECRET)
     * - /_next/static
     * - /_next/image
     * - favicon.ico, og.png
     */
    "/((?!r/|c/|pagar/|api/public/|api/webhook/|api/cron/|api/dolar|_next/static|_next/image|favicon.ico|og.png).*)",
  ],
};
