"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui";

/**
 * Vuelta del link de invitación (y de recuperar contraseña) con la plantilla de
 * mail POR DEFECTO de Supabase. Esos links traen la sesión en el fragmento de la
 * URL (#access_token=...&refresh_token=...), que el servidor no ve; por eso esta
 * página es de cliente. También acepta ?code= (PKCE) y ?token_hash= por si
 * algún día se usa una plantilla propia.
 */
export default function BienvenidaPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const done = () => router.replace("/perfil?bienvenida=1");

    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const code = query.get("code");
    const token_hash = query.get("token_hash");
    const failure = hash.get("error_description") ?? query.get("error_description");

    let attempt: Promise<{ error: { message: string } | null }>;
    if (failure) {
      attempt = Promise.resolve({ error: { message: failure } });
    } else if (access_token && refresh_token) {
      attempt = supabase.auth.setSession({ access_token, refresh_token });
    } else if (code) {
      attempt = supabase.auth.exchangeCodeForSession(code);
    } else if (token_hash) {
      attempt = supabase.auth.verifyOtp({ token_hash, type: query.get("type") === "recovery" ? "recovery" : "invite" });
    } else {
      // Puede que la sesión ya esté guardada (por ejemplo, si recargó la página).
      attempt = supabase.auth.getSession().then(({ data }) => ({
        error: data.session ? null : { message: "El link no trae datos de acceso." },
      }));
    }

    void attempt.then(({ error }) => {
      if (error) setError(error.message);
      else done();
    });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <h1 className="font-display text-3xl font-bold uppercase">No pudimos entrar</h1>
          <p className="text-muted">
            El link venció o ya se usó ({error}). Pedile a tu entrenador que te vuelva a invitar o que te cree la cuenta con
            contraseña.
          </p>
          <a href="/login" className="text-brand underline">
            Ir al login
          </a>
        </>
      ) : (
        <>
          <Spinner className="size-8 text-brand" />
          <p className="text-muted">Preparando tu cuenta…</p>
        </>
      )}
    </main>
  );
}
