import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { PublicSaldosPayload } from "@/types/pagos";

const TOKEN_RE = /^[a-f0-9]{64}$/;

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow",
};

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function loadPublicSaldos(
  token: string,
): Promise<PublicSaldosPayload | null> {
  const supa = anonClient();
  const { data, error } = await supa.rpc(
    "get_public_saldos" as never,
    { p_token: token } as never,
  );
  if (error) {
    console.error("[public-saldos:rpc] error", error);
    return null;
  }
  if (!data) return null;
  return data as unknown as PublicSaldosPayload;
}

/**
 * GET /api/public/[token]/saldos
 * Devuelve estado de cuenta + contratos visibles del cliente al que
 * pertenece el roadmap del token.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE },
    );
  }
  try {
    const data = await loadPublicSaldos(token);
    if (!data) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(data, { status: 200, headers: NO_STORE });
  } catch (err) {
    console.error("[public-saldos:GET] error", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: NO_STORE },
    );
  }
}
