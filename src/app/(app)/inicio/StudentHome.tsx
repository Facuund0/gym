"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Badge, Button, Card, EmptyState, Loading } from "@/components/ui";
import {
  currentWeek,
  fetchActiveProgram,
  fetchAnnouncements,
  fetchFormChecks,
  fetchProgramBundle,
  nextDay,
  type ProgramBundle,
} from "@/lib/data";
import type { Announcement, FormCheck } from "@/lib/types";

export function StudentHome() {
  const { profile } = useProfile();
  const [bundle, setBundle] = useState<ProgramBundle | null | undefined>(undefined);
  const [news, setNews] = useState<Announcement[]>([]);
  const [checks, setChecks] = useState<FormCheck[]>([]);
  const [lastWeekSessions, setLastWeekSessions] = useState(0);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const p = await fetchActiveProgram(profile.id);
      const b = p ? await fetchProgramBundle(p.id) : null;
      const now = Date.now();
      setLastWeekSessions(b?.sessions.filter((s) => now - new Date(s.completed_at).getTime() < 7 * 86400000).length ?? 0);
      setBundle(b);
    })();
    void fetchAnnouncements(3).then(setNews);
    void fetchFormChecks(profile.id, 3).then(setChecks);
  }, [profile]);

  if (bundle === undefined) return <Loading />;
  const first = profile?.full_name.split(" ")[0] ?? "";

  let today: { week: number; day: number; items: ProgramBundle["exercises"]; done: boolean } | null = null;
  if (bundle) {
    const week = currentWeek(bundle.program);
    const day = nextDay(bundle, week);
    const items = bundle.exercises.filter((e) => e.week === week && e.day === day).sort((a, b) => a.position - b.position);
    const done = bundle.sessions.some((s) => s.week === week && s.day === day);
    today = { week, day, items, done };
  }


  return (
    <div className="space-y-5">
      <div>
        <p className="text-muted">Hola{first ? `, ${first}` : ""} 👋</p>
        <h1 className="font-display text-4xl font-bold uppercase leading-none">¡A entrenar!</h1>
      </div>

      {!bundle || !today ? (
        <EmptyState title="Todavía no tenés una rutina activa">Cuando tu entrenador te la cargue, la vas a ver acá.</EmptyState>
      ) : (
        <Card className="border-brand/40 bg-gradient-to-br from-brand/15 to-transparent">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-wider text-muted">
              Semana {today.week} · Día {today.day}
            </p>
            {today.done && <Badge tone="ok">Completado</Badge>}
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold uppercase">{bundle.program.title}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {today.items.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>{e.exercise_name}</span>
                <span className="text-muted">
                  {e.sets}×{e.target_reps ?? "?"}
                </span>
              </li>
            ))}
          </ul>
          <Link href={`/rutina/${bundle.program.id}?semana=${today.week}&dia=${today.day}`}>
            <Button size="lg" className="mt-4 w-full">
              {today.done ? "Ver el día" : "Empezar el entrenamiento"}
            </Button>
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs uppercase tracking-wider text-muted">Últimos 7 días</p>
          <p className="font-display text-4xl font-bold">{lastWeekSessions}</p>
          <p className="text-sm text-muted">entrenamientos</p>
        </Card>
        <Link href="/progreso">
          <Card className="h-full transition hover:border-brand/60">
            <p className="text-xs uppercase tracking-wider text-muted">Tu progreso</p>
            <p className="mt-2 font-semibold">Ver tonelaje, peso y técnica →</p>
          </Card>
        </Link>
      </div>

      {checks.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-xl font-bold uppercase">Última técnica</h2>
          <Card className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{checks[0].exercise_name}</p>
              <p className="text-sm text-muted">
                {checks[0].reps} reps · {new Date(checks[0].created_at).toLocaleDateString("es-AR")}
              </p>
            </div>
            <span className="font-display text-3xl font-bold text-brand">{checks[0].score ?? "–"}</span>
          </Card>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase">Novedades</h2>
          <Link href="/novedades" className="text-sm text-brand">
            Ver todas
          </Link>
        </div>
        {news.length === 0 ? (
          <p className="text-sm text-muted">No hay novedades por ahora.</p>
        ) : (
          <div className="space-y-2">
            {news.map((n) => (
              <Card key={n.id}>
                <p className="font-semibold">{n.title}</p>
                <p className="line-clamp-2 text-sm text-muted">{n.body}</p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
