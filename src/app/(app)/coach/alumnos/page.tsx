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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/students/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: name, goal: goal || undefined }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) return setError(json.error ?? "No se pudo invitar");
    onDone();
  }

  return (
    <Card className="mb-4 space-y-3">
      <p className="text-sm text-muted">Le llega un mail para entrar y elegir su contraseña.</p>
      <Field label="Nombre y apellido">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Mail">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Objetivo" hint="opcional">
        <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej: ganar fuerza, bajar de peso" />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button className="w-full" onClick={invite} loading={loading} disabled={!email || name.length < 2}>
        Enviar invitación
      </Button>
    </Card>
  );
}
