import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cliente para Server Components, Server Actions y Route Handlers (actúa como el usuario logueado). */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: se ignora porque el proxy refresca la sesión.
          }
        },
      },
    },
  );
}

export interface SessionUser {
  id: string;
  email: string | null;
  role: "coach" | "student";
  full_name: string;
}

/**
 * Devuelve el usuario actual verificado + su rol, o null.
 * Usar SIEMPRE esto en route handlers antes de tocar datos.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const id = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", id).single();
  return {
    id,
    email: (data.claims.email as string | undefined) ?? null,
    role: (profile?.role as SessionUser["role"]) ?? "student",
    full_name: profile?.full_name ?? "",
  };
}
