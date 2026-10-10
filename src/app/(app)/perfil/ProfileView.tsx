"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Button, Card, ErrorNote, Field, Input, PageHeader } from "@/components/ui";
import { enablePush, isIos, isStandalone, pushSupport, type PushSupport } from "@/lib/firebase/client";
import { createClient } from "@/lib/supabase/client";

export function ProfileView() {
  const { profile, email, refresh, isCoach } = useProfile();
  const router = useRouter();
  const welcome = useSearchParams().get("bienvenida") === "1";
  const [name, setName] = useState(profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushOk, setPushOk] = useState(() => typeof Notification !== "undefined" && Notification.permission === "granted");

  useEffect(() => {
    void pushSupport().then(setSupport);
  }, []);

  async function saveName() {
    if (!profile) return;
    const { error } = await createClient().from("profiles").update({ full_name: name }).eq("id", profile.id);
    if (error) setError(error.message);
    else {
      setMsg("Datos guardados");
      void refresh();
    }
  }

  async function savePassword() {
    if (password.length < 8) return setError("La contraseña tiene que tener al menos 8 caracteres.");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) setError(error.message);
    else {
      setPassword("");
      setMsg("Contraseña actualizada");
    }
  }

  async function turnOnPush() {
    if (!profile) return;
    setPushLoading(true);
    setError(null);
    const r = await enablePush(profile.id);
    setPushLoading(false);
    if (r.ok) setPushOk(true);
    else setError(r.error ?? "No se pudieron activar");
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <PageHeader title="Perfil" subtitle={email ?? undefined} />
      {welcome && (
        <Card className="mb-4 border-brand/40 bg-brand/10">
          <p className="font-semibold">¡Bienvenido/a!</p>
          <p className="text-sm">Elegí una contraseña y activá las notificaciones para enterarte cuando tengas rutina nueva.</p>
        </Card>
      )}
      <div className="space-y-4">
        {msg && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{msg}</p>}
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card className="space-y-3">
          <Field label="Nombre y apellido">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={saveName}>
            Guardar
          </Button>
        </Card>

        <Card className="space-y-3">
          <Field label={welcome ? "Elegí tu contraseña" : "Nueva contraseña"} hint="mínimo 8 caracteres">
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={savePassword}>
            Guardar contraseña
          </Button>
        </Card>

        <Card className="space-y-3">
          <p className="font-semibold">Notificaciones</p>
          {pushOk ? (
            <p className="text-sm text-ok">Activadas en este dispositivo ✓</p>
          ) : support === "ios-needs-install" ? (
            <div className="text-sm text-muted">
              <p>En iPhone las notificaciones funcionan solo con la app instalada:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Tocá el botón Compartir de Safari.</li>
                <li>Elegí “Agregar a inicio”.</li>
                <li>Abrí la app desde el ícono y volvé a esta pantalla.</li>
              </ol>
            </div>
          ) : support === "not-configured" ? (
            <p className="text-sm text-muted">Las notificaciones todavía no están configuradas en el servidor.</p>
          ) : support === "denied" ? (
            <p className="text-sm text-muted">Las bloqueaste en el navegador. Habilitalas desde la configuración del sitio.</p>
          ) : support === "unsupported" ? (
            <p className="text-sm text-muted">Este navegador no soporta notificaciones push.</p>
          ) : (
            <Button onClick={turnOnPush} loading={pushLoading}>
              Activar notificaciones
            </Button>
          )}
        </Card>

        {!isStandalone() && (
          <Card>
            <p className="font-semibold">Instalá la app</p>
            <p className="text-sm text-muted">
              {isIos()
                ? "En Safari: Compartir → Agregar a inicio."
                : "En Chrome: menú ⋮ → Instalar app / Agregar a la pantalla principal."}
            </p>
          </Card>
        )}

        {!isCoach && (
          <Link href="/progreso" className="block">
            <Button variant="secondary" className="w-full">
              Ver mi progreso
            </Button>
          </Link>
        )}

        <Button variant="danger" className="w-full" onClick={logout}>
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}
