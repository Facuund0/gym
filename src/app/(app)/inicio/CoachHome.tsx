"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Loading, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface Activity {
  id: string;
  kind: "session" | "check" | "feedback";
  who: string;
  what: string;
  when: string;
  href: string;
}

export function CoachHome() {
  const [stats, setStats] = useState<{ students: number; active: number; sessions7: number; aiPending: number } | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    const sb = createClient();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    void (async () => {
      const [students, active, sessions7, aiPending, sessions, checks, feedback, profiles] = await Promise.all([
        sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("active", true),
        sb.from("programs").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("session_logs").select("id", { count: "exact", head: true }).gte("completed_at", since),
        sb.from("exercises").select("id", { count: "exact", head: true }).eq("rules_source", "gemini").eq("rules_reviewed", false),
        sb.from("session_logs").select("id, student_id, week, day, effort_rpe, completed_at, program_id").order("completed_at", { ascending: false }).limit(10),
        sb.from("form_checks").select("id, student_id, exercise_name, score, created_at").order("created_at", { ascending: false }).limit(10),
        sb.from("weekly_feedback").select("id, student_id, week, program_id, created_at").order("created_at", { ascending: false }).limit(5),
        sb.from("profiles").select("id, full_name"),
      ]);
      setStats({
        students: students.count ?? 0,
        active: active.count ?? 0,
        sessions7: sessions7.count ?? 0,
        aiPending: aiPending.count ?? 0,
      });
      const names = new Map((profiles.data ?? []).map((p) => [p.id as string, p.full_name as string]));
      const items: Activity[] = [
        ...(sessions.data ?? []).map((s) => ({
          id: `s${s.id}`,
          kind: "session" as const,
          who: names.get(s.student_id) ?? "Alumno",
          what: `Completó semana ${s.week} · día ${s.day}${s.effort_rpe ? ` (RPE ${s.effort_rpe})` : ""}`,
          when: s.completed_at,
          href: `/coach/alumnos/${s.student_id}`,
        })),
        ...(checks.data ?? []).map((c) => ({
          id: `c${c.id}`,
          kind: "check" as const,
          who: names.get(c.student_id) ?? "Alumno",
          what: `Revisó técnica de ${c.exercise_name}: ${c.score ?? "–"}/100`,
          when: c.created_at,
          href: `/coach/alumnos/${c.student_id}`,
        })),
        ...(feedback.data ?? []).map((f) => ({
          id: `f${f.id}`,
          kind: "feedback" as const,
          who: names.get(f.student_id) ?? "Alumno",
          what: `Mandó el feedback de la semana ${f.week}`,
          when: f.created_at,
          href: `/coach/alumnos/${f.student_id}`,
        })),
      ].sort((a, b) => b.when.localeCompare(a.when));
      setActivity(items.slice(0, 15));
    })();
  }, []);

  if (!stats) return <Loading />;

  return (
    <>
      <PageHeader title="Panel del entrenador" />
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="font-display text-4xl font-bold">{stats.students}</p>
          <p className="text-xs text-muted">alumnos</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-4xl font-bold">{stats.active}</p>
          <p className="text-xs text-muted">programas activos</p>
        </Card>
        <Card className="text-center">
          <p className="font-display text-4xl font-bold">{stats.sessions7}</p>
          <p className="text-xs text-muted">sesiones (7 días)</p>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href="/coach/alumnos">
          <Button className="w-full">Alumnos y rutinas</Button>
        </Link>
        <Link href="/novedades">
          <Button variant="secondary" className="w-full">
            Publicar novedad
          </Button>
        </Link>
      </div>

      {stats.aiPending > 0 && (
        <Link href="/coach/ejercicios?filtro=ia" className="mt-4 block">
          <Card className="border-warn/40">
            <p className="font-semibold">
              {stats.aiPending} ejercicio{stats.aiPending > 1 ? "s" : ""} con reglas generadas por IA sin revisar
            </p>
            <p className="text-sm text-muted">Revisalas para que las correcciones sean confiables.</p>
          </Card>
        </Link>
      )}

      <h2 className="mb-2 mt-6 font-display text-xl font-bold uppercase">Actividad reciente</h2>
      {activity.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay actividad de alumnos.</p>
      ) : (
        <div className="space-y-2">
          {activity.map((a) => (
            <Link key={a.id} href={a.href} className="block">
              <Card className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{a.who}</p>
                  <p className="text-sm text-muted">{a.what}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={a.kind === "check" ? "brand" : a.kind === "feedback" ? "warn" : "ok"}>
                    {a.kind === "check" ? "Técnica" : a.kind === "feedback" ? "Feedback" : "Sesión"}
                  </Badge>
                  <span className="text-xs text-muted">{new Date(a.when).toLocaleDateString("es-AR")}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
