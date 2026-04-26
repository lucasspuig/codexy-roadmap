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
     * - /api/public/* (endpoints públicos con token)
     * - /_next/static
     * - /_next/image
     * - favicon.ico, og.png
     */
    "/((?!r/|c/|api/public/|_next/static|_next/image|favicon.ico|og.png).*)",
  ],
};
