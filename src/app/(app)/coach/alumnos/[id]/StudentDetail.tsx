"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { fetchFormChecks, fetchPrograms } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { FormCheck, Profile, Program, SessionLog, WeeklyFeedback } from "@/lib/types";

export function StudentDetail({ studentId }: { studentId: string }) {
  const router = useRouter();
  const { profile: me } = useProfile();
  const [student, setStudent] = useState<Profile | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [feedback, setFeedback] = useState<WeeklyFeedback[]>([]);
  const [checks, setChecks] = useState<FormCheck[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const sb = createClient();
    void sb.from("profiles").select("*").eq("id", studentId).single().then(({ data }) => setStudent(data as Profile));
    void fetchPrograms(studentId).then(setPrograms);
    void sb
      .from("session_logs")
      .select("*")
      .eq("student_id", studentId)
      .order("completed_at", { ascending: false })
      .limit(12)
      .then(({ data }) => setSessions((data as SessionLog[]) ?? []));
    void sb
      .from("weekly_feedback")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setFeedback((data as WeeklyFeedback[]) ?? []));
    void fetchFormChecks(studentId, 10).then(setChecks);
  }, [studentId]);

  if (!student) return <Loading />;

  return (
    <>
      <PageHeader
        title={student.full_name || "Alumno"}
        subtitle={student.goal ? `Objetivo: ${student.goal}` : undefined}
        action={<Button size="sm" onClick={() => setCreating(true)}>+ Programa</Button>}
      />

      {creating && me && (
        <NewProgramForm
          student={student}
          coachId={me.id}
          onCancel={() => setCreating(false)}
          onCreated={(id) => router.push(`/coach/programas/${id}`)}
          templates={programs}
        />
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl font-bold uppercase">Programas</h2>
        {programs.length === 0 ? (
          <p className="text-sm text-muted">Sin programas todavía.</p>
        ) : (
          <div className="space-y-2">
            {programs.map((p) => (
              <Link key={p.id} href={`/coach/programas/${p.id}`} className="block">
                <Card className="flex items-center justify-between py-3 transition hover:border-brand/60">
                  <div>
                    <p className="font-semibold">{p.title}</p>
                    <p className="text-sm text-muted">
                      {p.weeks} semanas · {p.days_per_week} días · {new Date(`${p.start_date}T00:00:00`).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <Badge tone={p.status === "active" ? "ok" : p.status === "draft" ? "warn" : "neutral"}>
                    {p.status === "active" ? "Activo" : p.status === "draft" ? "Borrador" : "Archivado"}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-xl font-bold uppercase">Últimas sesiones</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">Todavía no registró entrenamientos.</p>
        ) : (
          <Card className="divide-y divide-border p-0">
            {sessions.map((s) => (
              <div key={s.id} className="flex justify-between px-4 py-2 text-sm">
                <span>
                  Sem {s.week} · Día {s.day}
                </span>
                <span className="text-muted">
                  {[s.duration_min && `${s.duration_min}′`, s.effort_rpe && `RPE ${s.effort_rpe}`, s.doms && `DOMS ${s.doms}`, s.weigh_in_kg && `${s.weigh_in_kg} kg`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {feedback.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-display text-xl font-bold uppercase">Feedback semanal</h2>
          <div className="space-y-2">
            {feedback.map((f) => (
              <Card key={f.id} className="text-sm">
                <p className="mb-1 font-semibold">Semana {f.week}</p>
                <p className="text-muted">
                  Motivación {f.motivation ?? "–"} · Esfuerzo {f.perceived_effort ?? "–"} · Estrés {f.stress ?? "–"} · Sueño{" "}
                  {f.sleep_hours ?? "–"} h (calidad {f.sleep_quality ?? "–"}) · Saciedad {f.satiety ?? "–"}
                </p>
                {f.disliked_exercises && <p className="mt-1">No le gustó: {f.disliked_exercises}</p>}
                {f.foods_bad && <p>Le cayó mal: {f.foods_bad}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      {checks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-display text-xl font-bold uppercase">Técnica con cámara</h2>
          <Card className="divide-y divide-border p-0">
            {checks.map((c) => (
              <div key={c.id} className="px-4 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{c.exercise_name}</span>
                  <span className="font-bold text-brand">{c.score ?? "–"}</span>
                </div>
                <p className="text-muted">
                  {new Date(c.created_at).toLocaleDateString("es-AR")} · {c.reps} reps
                  {c.issues.length > 0 && ` · ${c.issues.map((i) => `${i.label} (${i.count})`).join(", ")}`}
                </p>
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}

function NewProgramForm({
  student,
  coachId,
  templates,
  onCancel,
  onCreated,
}: {
  student: Profile;
  coachId: string;
  templates: Program[];
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const nextMonday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  const [title, setTitle] = useState("Bloque 1");
  const [weeks, setWeeks] = useState(4);
  const [days, setDays] = useState(3);
  const [start, setStart] = useState(nextMonday);
  const [goal, setGoal] = useState(student.goal ?? "");
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setLoading(true);
    setError(null);
    const sb = createClient();
    const { data, error } = await sb
      .from("programs")
      .insert({ student_id: student.id, coach_id: coachId, title, weeks, days_per_week: days, start_date: start, goal: goal || null, notes: notes || null })
      .select("id")
      .single();
    if (error || !data) {
      setLoading(false);
      return setError(error?.message ?? "Error");
    }
    if (copyFrom) {
      // Copia la estructura de otro programa (sin los registros del alumno)
      const { data: rows } = await sb.from("program_exercises").select("*").eq("program_id", copyFrom).lte("week", weeks).lte("day", days);
      const clones = (rows ?? []).map(({ id, program_id, ...r }) => ({ ...r, program_id: data.id }));
      if (clones.length) await sb.from("program_exercises").insert(clones);
    }
    onCreated(data.id);
  }

  return (
    <Card className="mb-6 space-y-3">
      <Field label="Nombre del programa">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Semanas">
          <Input type="number" min={1} max={12} value={weeks} onChange={(e) => setWeeks(Math.min(12, Math.max(1, Number(e.target.value))))} />
        </Field>
        <Field label="Días/sem">
          <Input type="number" min={1} max={6} value={days} onChange={(e) => setDays(Math.min(6, Math.max(1, Number(e.target.value))))} />
        </Field>
        <Field label="Inicio">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
      </div>
      <Field label="Objetivo">
        <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
      </Field>
      {templates.length > 0 && (
        <Field label="Copiar ejercicios de" hint="opcional">
          <Select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Empezar vacío</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Notas" hint="opcional">
        <Textarea className="min-h-14" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={create} loading={loading}>
          Crear y cargar ejercicios
        </Button>
      </div>
    </Card>
  );
}
