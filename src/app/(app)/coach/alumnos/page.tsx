"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Loading, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Program } from "@/lib/types";

type Row = Profile & { activeProgram?: Program; daysSince: number | null };

export default function AlumnosPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const load = async (): Promise<Row[]> => {
    const sb = createClient();
    const [{ data: students }, { data: programs }, { data: sessions }] = await Promise.all([
      sb.from("profiles").select("*").eq("role", "student").order("full_name"),
      sb.from("programs").select("*").eq("status", "active"),
      sb.from("session_logs").select("student_id, completed_at").order("completed_at", { ascending: false }).limit(500),
    ]);
    const last = new Map<string, string>();
    for (const s of sessions ?? []) if (!last.has(s.student_id)) last.set(s.student_id, s.completed_at);
    const now = Date.now();
    return ((students as Profile[]) ?? []).map((s) => {
      const l = last.get(s.id);
      return {
        ...s,
        activeProgram: (programs as Program[] | null)?.find((p) => p.student_id === s.id),
        daysSince: l ? Math.floor((now - new Date(l).getTime()) / 86400000) : null,
      };
    });
  };

  useEffect(() => {
    void load().then(setRows);
  }, []);

  const filtered = (rows ?? []).filter((r) => r.full_name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Alumnos"
        subtitle={rows ? `${rows.length} en total` : undefined}
        action={<Button size="sm" onClick={() => setShowInvite(!showInvite)}>+ Invitar</Button>}
      />
      {showInvite && <InviteForm onDone={() => { setShowInvite(false); void load().then(setRows); }} />}
      <Input placeholder="Buscar alumno…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      {!rows ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay alumnos todavía">Invitalos con su mail y van a poder ver sus rutinas.</EmptyState>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const days = r.daysSince;
            return (
              <Link key={r.id} href={`/coach/alumnos/${r.id}`} className="block">
                <Card className="flex items-center justify-between gap-3 py-3 transition hover:border-brand/60">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.full_name || "(sin nombre)"}</p>
                    <p className="truncate text-sm text-muted">{r.activeProgram ? r.activeProgram.title : "Sin programa activo"}</p>
                  </div>
                  {days === null ? (
                    <Badge>Sin registros</Badge>
                  ) : days > 7 ? (
                    <Badge tone="bad">Hace {days} días</Badge>
                  ) : (
                    <Badge tone="ok">{days === 0 ? "Hoy" : `Hace ${days} d`}</Badge>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"password" | "invite">("password");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function suggestPassword() {
    const words = ["fuerza", "sentadilla", "remo", "press", "banco", "barra", "pesa", "salto"];
    const w = words[Math.floor(Math.random() * words.length)];
    setPassword(`${w}${Math.floor(1000 + Math.random() * 9000)}`);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/students/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: name,
        goal: goal || undefined,
        password: mode === "password" ? password : undefined,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(json.error ?? "No se pudo crear el alumno");
    if (mode === "password") setCreated({ email, password });
    else onDone();
  }

  if (created) {
    const text = `¡Hola ${name.split(" ")[0]}! Ya tenés tu cuenta en GymClaud.\nEntrá a ${window.location.origin}\nMail: ${created.email}\nContraseña: ${created.password}\n(Después la podés cambiar en Perfil)`;
    return (
      <Card className="mb-4 space-y-3 border-ok/40">
        <p className="font-semibold text-ok">Alumno creado ✓</p>
        <p className="text-sm text-muted">Pasale estos datos (por WhatsApp, por ejemplo):</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{text}</pre>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => void navigator.clipboard?.writeText(text)}>
            Copiar
          </Button>
          <a className="flex-1" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            <Button className="w-full">WhatsApp</Button>
          </a>
        </div>
        <Button variant="ghost" className="w-full" onClick={onDone}>
          Listo
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button variant={mode === "password" ? "primary" : "secondary"} size="sm" onClick={() => setMode("password")}>
          Crear con contraseña
        </Button>
        <Button variant={mode === "invite" ? "primary" : "secondary"} size="sm" onClick={() => setMode("invite")}>
          Invitar por mail
        </Button>
      </div>
      <p className="text-sm text-muted">
        {mode === "password"
          ? "Creás la cuenta ya lista y le pasás el mail y la contraseña al alumno. No depende de que llegue un mail."
          : "Le llega un mail para entrar y elegir su contraseña. En el plan gratis de Supabase los mails pueden no llegar si no configuraste SMTP."}
      </p>
      <Field label="Nombre y apellido">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Mail">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {mode === "password" && (
        <Field label="Contraseña inicial" hint="mínimo 8 caracteres">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button variant="secondary" onClick={suggestPassword}>
              Sugerir
            </Button>
          </div>
        </Field>
      )}
      <Field label="Objetivo" hint="opcional">
        <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej: ganar fuerza, bajar de peso" />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button
        className="w-full"
        onClick={submit}
        loading={loading}
        disabled={!email || name.length < 2 || (mode === "password" && password.length < 8)}
      >
        {mode === "password" ? "Crear alumno" : "Enviar invitación"}
      </Button>
    </Card>
  );
}
