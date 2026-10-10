"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/inicio";
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);

  // Si Supabase mandó a alguien acá con la sesión en el #hash (invitación con la
  // plantilla por defecto), lo pasamos a la página que la toma.
  useEffect(() => {
    if (window.location.hash.includes("access_token=")) router.replace(`/auth/bienvenida${window.location.hash}`);
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError("Mail o contraseña incorrectos.");
      router.replace(next);
      router.refresh();
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
      });
      setLoading(false);
      if (error) return setError("No pudimos mandar el link. ¿El mail está registrado en el gimnasio?");
      setSent(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <Image src="/brand-logo.png" alt={APP_NAME} width={320} height={160} priority className="mx-auto mb-8 w-56 rounded-2xl" />
      <h1 className="font-display text-3xl font-bold uppercase">Ingresá</h1>
      <p className="mb-6 text-sm text-muted">Tu rutina, tu progreso y tu técnica en un solo lugar.</p>

      {sent ? (
        <p className="rounded-xl bg-ok/10 p-4 text-ok">Te mandamos un link a {email}. Abrilo desde este mismo dispositivo.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Mail">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode === "password" && (
            <Field label="Contraseña">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {mode === "password" ? "Entrar" : "Mandame un link"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-muted underline"
            onClick={() => setMode(mode === "password" ? "magic" : "password")}
          >
            {mode === "password" ? "Prefiero entrar con un link al mail" : "Entrar con contraseña"}
          </button>
        </form>
      )}
      <p className="mt-10 text-center text-xs text-muted">
        ¿No tenés cuenta? Pedile a tu entrenador que te invite.
      </p>
    </main>
  );
}
