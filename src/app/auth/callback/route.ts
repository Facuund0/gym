import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Vuelta del link mágico (flujo PKCE con ?code=). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("El link venció o ya se usó. Pedí otro.")}`);
}

function safeNext(n: string | null): string {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/inicio";
}
