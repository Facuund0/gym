import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Confirmación por token_hash: invitaciones, recuperación de contraseña y
 * confirmación de mail. Las plantillas de mail de Supabase tienen que apuntar acá
 * (ver docs/setup.md → "Plantillas de mail").
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/inicio";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const dest = type === "invite" || type === "recovery" ? "/perfil?bienvenida=1" : next;
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }
  // También soporta ?code= por si el proyecto usa PKCE en las invitaciones
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("El link venció o ya se usó.")}`);
}
