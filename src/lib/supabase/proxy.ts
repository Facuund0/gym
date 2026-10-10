import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth", "/manifest.webmanifest", "/sw.js", "/templates", "/offline"];

/**
 * Refresca la sesión de Supabase en cada request y manda al login a quien no
 * esté autenticado. Basado en la guía oficial de Supabase para Next.js 16 (proxy.ts).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => supabaseResponse.headers.set(k, v));
        },
      },
    },
  );

  // IMPORTANTE: no meter código entre createServerClient y getClaims().
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path.startsWith(p));
  const isApi = path.startsWith("/api");

  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return supabaseResponse;
}
