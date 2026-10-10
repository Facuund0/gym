"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Textarea, cn } from "@/components/ui";
import { ExportPlanillaButton } from "@/components/program/ExportPlanillaButton";
import { RestTimer, parseRest } from "@/components/program/RestTimer";
import {
  currentWeek,
  fetchProgramBundle,
  formatKg,
  nextDay,
  saveExerciseLog,
  saveSessionLog,
  tonnage,
  type ProgramBundle,
} from "@/lib/data";
import { slugify } from "@/lib/slug";
import type { LoggedSet, ProgramExercise } from "@/lib/types";

export function WorkoutView({ programId }: { programId: string }) {
  const { profile } = useProfile();
  const router = useRouter();
  const params = useSearchParams();
  const [bundle, setBundle] = useState<ProgramBundle | null | undefined>(undefined);
  const [rest, setRest] = useState<{ seconds: number; key: number } | null>(null);
  const [showFinish, setShowFinish] = useState(false);

  const reload = useCallback(() => fetchProgramBundle(programId).then(setBundle), [programId]);
  useEffect(() => {
    void fetchProgramBundle(programId).then(setBundle);
  }, [programId]);

  const week = useMemo(() => {
    const q = Number(params.get("semana"));
    if (q) return q;
    return bundle ? currentWeek(bundle.program) : 1;
  }, [params, bundle]);

  const day = useMemo(() => {
    const q = Number(params.get("dia"));
    if (q) return q;
    return bundle ? nextDay(bundle, week) : 1;
  }, [params, bundle, week]);

  if (bundle === undefined) return <Loading />;
  if (bundle === null) return <EmptyState title="No encontramos esta rutina" />;

  const days = Array.from(new Set(bundle.exercises.filter((e) => e.week === week).map((e) => e.day))).sort((a, b) => a - b);
  const items = bundle.exercises.filter((e) => e.week === week && e.day === day).sort((a, b) => a.position - b.position);
  const session = bundle.sessions.find((s) => s.week === week && s.day === day);
  const weekDone = days.length > 0 && days.every((d) => bundle.sessions.some((s) => s.week === week && s.day === d));
  const feedbackDone = bundle.feedback.some((f) => f.week === week);
  const isOwner = profile?.id === bundle.program.student_id;

  const go = (w: number, d?: number) => {
    const q = new URLSearchParams({ semana: String(w) });
    if (d) q.set("dia", String(d));
    router.replace(`/rutina/${programId}?${q.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase leading-none">{bundle.program.title}</h1>
          {bundle.program.goal && <p className="mt-1 text-sm text-muted">Objetivo: {bundle.program.goal}</p>}
        </div>
        <ExportPlanillaButton bundle={bundle} size="sm" />
      </div>

      <div className="-mx-4 mb-2 overflow-x-auto px-4">
        <div className="flex gap-2">
          {Array.from({ length: bundle.program.weeks }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              onClick={() => go(w)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold",
                w === week ? "bg-brand text-white" : "bg-surface-2 text-muted",
              )}
            >
              Sem {w}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <EmptyState title={`La semana ${week} todavía no tiene ejercicios`} />
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            {days.map((d) => {
              const done = bundle.sessions.some((s) => s.week === week && s.day === d);
              return (
                <button
                  key={d}
                  onClick={() => go(week, d)}
                  className={cn(
                    "flex-1 rounded-xl border px-2 py-2 text-sm font-semibold",
                    d === day ? "border-brand bg-brand/10 text-brand" : "border-border text-muted",
                  )}
                >
                  Día {d} {done && "✓"}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {items.map((ex) => (
              <ExerciseCard
                key={ex.id}
                ex={ex}
                bundle={bundle}
                editable={isOwner}
                onRest={(s) => setRest((r) => ({ seconds: s, key: (r?.key ?? 0) + 1 }))}
                onSaved={(sets, note) =>
                  setBundle((b) =>
                    b
                      ? {
                          ...b,
                          logs: {
                            ...b.logs,
                            [ex.id]: {
                              id: b.logs[ex.id]?.id ?? "",
                              program_exercise_id: ex.id,
                              student_id: b.program.student_id,
                              sets,
                              student_note: note,
                              updated_at: new Date().toISOString(),
                            },
                          },
                        }
                      : b,
                  )
                }
              />
            ))}
          </div>

          {isOwner && (
            <div className="mt-6 space-y-3">
              {session ? (
                <Card className="border-ok/40">
                  <p className="font-semibold text-ok">Día completado ✓</p>
                  <p className="text-sm text-muted">
                    {[
                      session.duration_min && `${session.duration_min} min`,
                      session.effort_rpe && `RPE ${session.effort_rpe}`,
                      session.weigh_in_kg && formatKg(Number(session.weigh_in_kg)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <button className="mt-2 text-sm text-brand underline" onClick={() => setShowFinish(true)}>
                    Editar resumen
                  </button>
                </Card>
              ) : (
                <Button size="lg" className="w-full" onClick={() => setShowFinish(true)}>
                  Terminar el día
                </Button>
              )}
              {weekDone && !feedbackDone && (
                <Link href={`/rutina/${programId}/feedback?semana=${week}`} className="block">
                  <Card className="border-brand/50">
                    <p className="font-semibold">¿Cómo te fue esta semana?</p>
                    <p className="text-sm text-muted">Contale a tu entrenador cómo dormiste, comiste y te sentiste (2 minutos).</p>
                  </Card>
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {showFinish && profile && (
        <FinishDayForm
          programId={programId}
          studentId={profile.id}
          week={week}
          day={day}
          initial={session}
          onClose={() => setShowFinish(false)}
          onSaved={() => {
            setShowFinish(false);
            void reload();
          }}
        />
      )}
      {rest !== null && <RestTimer key={rest.key} seconds={rest.seconds} onClose={() => setRest(null)} />}
    </>
  );
}

function ExerciseCard({
  ex,
  bundle,
  editable,
  onRest,
  onSaved,
}: {
  ex: ProgramExercise;
  bundle: ProgramBundle;
  editable: boolean;
  onRest: (s: number) => void;
  onSaved: (sets: LoggedSet[], note: string | null) => void;
}) {
  const log = bundle.logs[ex.id];
  const [sets, setSets] = useState<LoggedSet[]>(() =>
    Array.from({ length: ex.sets }, (_, i) => log?.sets?.[i] ?? { reps: null, kg: null }),
  );
  const [note, setNote] = useState(log?.student_note ?? "");
  const [done, setDone] = useState<boolean[]>(() => Array.from({ length: ex.sets }, (_, i) => Boolean(log?.sets?.[i]?.reps)));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lo que hizo la semana anterior en el mismo lugar (para progresar).
  const prev = useMemo(() => {
    const p = bundle.exercises.find((e) => e.week === ex.week - 1 && e.day === ex.day && e.position === ex.position);
    return p ? bundle.logs[p.id]?.sets ?? [] : [];
  }, [bundle, ex]);

  const persist = (nextSets: LoggedSet[], nextNote: string) => {
    if (!editable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const err = await saveExerciseLog(ex.id, bundle.program.student_id, nextSets, nextNote || null);
      setError(err);
      if (!err) onSaved(nextSets, nextNote || null);
    }, 600);
  };

  const update = (i: number, field: keyof LoggedSet, value: string) => {
    const v = value === "" ? null : Number(value.replace(",", "."));
    const next = sets.map((s, idx) => (idx === i ? { ...s, [field]: Number.isFinite(v) ? v : null } : s));
    setSets(next);
    persist(next, note);
  };

  const check = (i: number) => {
    const next = [...done];
    next[i] = !next[i];
    setDone(next);
    // si marcó la serie sin cargar reps, usamos el objetivo
    if (next[i] && sets[i].reps === null) {
      const target = Number.parseInt(ex.target_reps ?? "", 10);
      if (Number.isFinite(target)) update(i, "reps", String(target));
    }
    if (next[i]) {
      const secs = parseRest(ex.rest);
      if (secs) onRest(secs);
    }
  };

  const total = tonnage(sets);
  const techniqueHref = `/tecnica/${slugify(ex.exercise_name)}?name=${encodeURIComponent(ex.exercise_name)}&pe=${ex.id}`;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold leading-tight">{ex.exercise_name}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {[
              `${ex.sets} series`,
              ex.target_reps && `${ex.target_reps} reps`,
              ex.target_kg && `${ex.target_kg} kg`,
              ex.rir_rpe,
              ex.rest && `descanso ${ex.rest}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {ex.category && <Badge tone="brand">{ex.category}</Badge>}
      </div>

      {ex.coach_feedback && (
        <p className="mt-3 rounded-xl bg-brand/10 px-3 py-2 text-sm">
          <span className="font-semibold text-brand">Tu entrenador: </span>
          {ex.coach_feedback}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-[3rem_1fr_1fr_2.75rem] gap-2 px-1 text-xs uppercase tracking-wide text-muted">
          <span>Serie</span>
          <span>Reps</span>
          <span>Kg</span>
          <span />
        </div>
        {sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[3rem_1fr_1fr_2.75rem] items-center gap-2">
            <span className="text-center font-display text-xl font-bold text-muted">{i + 1}</span>
            <Input
              inputMode="numeric"
              type="number"
              disabled={!editable}
              placeholder={prev[i]?.reps ? String(prev[i].reps) : (ex.target_reps ?? "")}
              value={s.reps ?? ""}
              onChange={(e) => update(i, "reps", e.target.value)}
            />
            <Input
              inputMode="decimal"
              type="number"
              step="0.5"
              disabled={!editable}
              placeholder={prev[i]?.kg ? String(prev[i].kg) : ex.target_kg ? String(ex.target_kg) : ""}
              value={s.kg ?? ""}
              onChange={(e) => update(i, "kg", e.target.value)}
            />
            <button
              aria-label={`Marcar serie ${i + 1}`}
              disabled={!editable}
              onClick={() => check(i)}
              className={cn(
                "flex h-11 items-center justify-center rounded-xl border text-lg font-bold",
                done[i] ? "border-ok bg-ok/15 text-ok" : "border-border text-muted",
              )}
            >
              ✓
            </button>
          </div>
        ))}
      </div>

      {prev.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Semana anterior: {prev.map((p) => `${p.reps ?? "-"}×${p.kg ?? "-"}`).join(" · ")}
        </p>
      )}

      {editable && (
        <Textarea
          className="mt-3 min-h-16 text-sm"
          placeholder="Notas para tu entrenador (molestias, sensaciones…)"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            persist(sets, e.target.value);
          }}
        />
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted">Tonelaje: {formatKg(total)}</span>
        <Link href={techniqueHref} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Revisar técnica
        </Link>
      </div>
    </Card>
  );
}

function Scale({ value, onChange, from, to, prefix = "" }: { value: number | null; onChange: (n: number) => void; from: number; to: number; prefix?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
        <button
          type="button"
          key={n}
          onClick={() => onChange(n)}
          className={cn(
            "min-w-10 rounded-lg px-2 py-2 text-sm font-semibold",
            value === n ? "bg-brand text-white" : "bg-surface-2 text-muted",
          )}
        >
          {prefix}
          {n}
        </button>
      ))}
    </div>
  );
}

function FinishDayForm({
  programId,
  studentId,
  week,
  day,
  initial,
  onClose,
  onSaved,
}: {
  programId: string;
  studentId: string;
  week: number;
  day: number;
  initial?: ProgramBundle["sessions"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [duration, setDuration] = useState<string>(initial?.duration_min ? String(initial.duration_min) : "");
  const [doms, setDoms] = useState<number | null>(initial?.doms ?? null);
  const [group, setGroup] = useState(initial?.muscle_group ?? "");
  const [weight, setWeight] = useState(initial?.weigh_in_kg ? String(initial.weigh_in_kg) : "");
  const [effort, setEffort] = useState<number | null>(initial?.effort_rpe ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    const err = await saveSessionLog({
      program_id: programId,
      student_id: studentId,
      week,
      day,
      duration_min: duration ? Number(duration) : null,
      doms,
      muscle_group: group || null,
      weigh_in_kg: weight ? Number(weight.replace(",", ".")) : null,
      effort_rpe: effort,
    });
    setSaving(false);
    if (err) setError(err);
    else onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 sm:mx-auto sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold uppercase">Resumen del día {day}</h2>
        <p className="mb-4 text-sm text-muted">Esto le sirve a tu entrenador para ajustar la carga.</p>
        <div className="space-y-4">
          <Field label="Duración de la sesión" hint="minutos">
            <Input type="number" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium text-muted">Esfuerzo general (RPE)</p>
            <Scale value={effort} onChange={setEffort} from={5} to={10} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-muted">Dolor muscular de días anteriores (DOMS 1-10)</p>
            <Scale value={doms} onChange={setDoms} from={1} to={10} />
          </div>
          <Field label="Grupo muscular que más sentiste">
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Ej: piernas" />
          </Field>
          <Field label="Pesaje del día" hint="kg, opcional">
            <Input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={save} loading={saving}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
