"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Select, Textarea, cn } from "@/components/ui";
import { ExportPlanillaButton } from "@/components/program/ExportPlanillaButton";
import { CATEGORIES, MUSCLES, seriesByMuscle } from "@/lib/categories";
import { fetchProgramBundle, tonnage, type ProgramBundle } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { Exercise, Program, ProgramExercise } from "@/lib/types";

type Row = ProgramExercise & { _dirty?: boolean; _saving?: boolean; _error?: string | null };

const MAX_POS = 8;

export function ProgramEditor({ programId }: { programId: string }) {
  const [bundle, setBundle] = useState<ProgramBundle | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [week, setWeek] = useState(1);
  const [meta, setMeta] = useState<Program | null>(null);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [showCounter, setShowCounter] = useState(false);

  const apply = useCallback((b: ProgramBundle | null) => {
    setBundle(b);
    if (b) {
      setRows(b.exercises);
      setMeta(b.program);
    }
  }, []);
  const load = useCallback(() => fetchProgramBundle(programId).then(apply), [programId, apply]);

  useEffect(() => {
    void fetchProgramBundle(programId).then(apply);
    void createClient()
      .from("exercises")
      .select("*")
      .order("name")
      .then(({ data }) => setLibrary((data as Exercise[]) ?? []));
  }, [programId, apply]);

  const byName = useMemo(() => new Map(library.map((e) => [e.name.toLowerCase(), e])), [library]);

  if (bundle === undefined || !meta) return <Loading />;
  if (bundle === null) return <EmptyState title="Programa no encontrado" />;

  const weekRows = rows.filter((r) => r.week === week);

  async function saveMeta() {
    if (!meta || !bundle) return;
    const wasActive = bundle.program.status === "active";
    const { error } = await createClient()
      .from("programs")
      .update({
        title: meta.title,
        goal: meta.goal,
        weeks: meta.weeks,
        days_per_week: meta.days_per_week,
        start_date: meta.start_date,
        status: meta.status,
        notes: meta.notes,
      })
      .eq("id", meta.id);
    if (error) return setMetaMsg(error.message);
    let msg = "Guardado";
    if (meta.status === "active" && !wasActive) {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "¡Tenés rutina nueva! 💪",
          body: `${meta.title}: ya podés verla en la app.`,
          url: `/rutina/${meta.id}`,
          userIds: [meta.student_id],
        }),
      });
      const json = await res.json().catch(() => ({}));
      msg = res.ok ? `Programa activado. Notificación enviada (${json.sent ?? 0}).` : "Programa activado (no se pudo notificar).";
    }
    setMetaMsg(msg);
    setBundle({ ...bundle, program: meta });
  }

  function patch(id: string, changes: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes, _dirty: true } : r)));
  }

  function onNameChange(row: Row, name: string) {
    const ex = byName.get(name.trim().toLowerCase());
    patch(row.id, {
      exercise_name: name,
      exercise_id: ex?.id ?? null,
      category: row.category ?? ex?.category ?? null,
    });
  }

  async function saveRow(row: Row) {
    if (!row._dirty) return;
    if (!row.exercise_name.trim()) return;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, _saving: true } : r)));
    const payload = {
      program_id: programId,
      week: row.week,
      day: row.day,
      position: row.position,
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name.trim(),
      category: row.category || null,
      sets: Math.min(5, Math.max(1, row.sets || 3)),
      rir_rpe: row.rir_rpe || null,
      rest: row.rest || null,
      target_reps: row.target_reps || null,
      target_kg: row.target_kg ?? null,
      coach_feedback: row.coach_feedback || null,
    };
    const { data, error } = await createClient()
      .from("program_exercises")
      .upsert(payload, { onConflict: "program_id,week,day,position" })
      .select("*")
      .single();
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id ? (error ? { ...r, _saving: false, _error: error.message } : { ...(data as ProgramExercise), _dirty: false, _saving: false, _error: null }) : r,
      ),
    );
  }

  async function removeRow(row: Row) {
    if (!row.id.startsWith("new-")) {
      if (!confirm(`¿Quitar "${row.exercise_name}"?`)) return;
      await createClient().from("program_exercises").delete().eq("id", row.id);
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  function addRow(day: number) {
    const used = new Set(rows.filter((r) => r.week === week && r.day === day).map((r) => r.position));
    const position = Array.from({ length: MAX_POS }, (_, i) => i + 1).find((p) => !used.has(p));
    if (!position) return;
    setRows((rs) => [
      ...rs,
      {
        id: `new-${crypto.randomUUID()}`,
        program_id: programId,
        week,
        day,
        position,
        exercise_id: null,
        exercise_name: "",
        category: null,
        sets: 3,
        rir_rpe: null,
        rest: null,
        target_reps: null,
        target_kg: null,
        coach_feedback: null,
        _dirty: true,
      },
    ]);
  }

  async function copyWeekForward() {
    if (!meta) return;
    const targets = Array.from({ length: meta.weeks - week }, (_, i) => week + i + 1);
    if (!targets.length) return;
    if (!confirm(`¿Copiar la semana ${week} a las semanas ${targets.join(", ")}? Se reemplazan los ejercicios que haya en esas semanas.`)) return;
    const sb = createClient();
    const source = rows.filter((r) => r.week === week && !r.id.startsWith("new-"));
    await sb.from("program_exercises").delete().eq("program_id", programId).in("week", targets);
    const clones = targets.flatMap((w) =>
      source.map(({ id, _dirty, _saving, _error, ...r }) => ({ ...r, week: w })),
    );
    if (clones.length) await sb.from("program_exercises").insert(clones);
    await load();
  }

  const series = seriesByMuscle(weekRows.filter((r) => r.category).map((r) => ({ category: r.category, sets: r.sets })));

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <Link href={`/coach/alumnos/${meta.student_id}`} className="text-sm text-muted">
            ← {bundle.student?.full_name}
          </Link>
          <h1 className="font-display text-3xl font-bold uppercase leading-none">{meta.title}</h1>
        </div>
        <ExportPlanillaButton bundle={{ ...bundle, program: meta, exercises: rows.filter((r) => !r.id.startsWith("new-")) }} size="sm" />
      </div>

      <Card className="mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Nombre">
            <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </Field>
          <Field label="Inicio">
            <Input type="date" value={meta.start_date} onChange={(e) => setMeta({ ...meta, start_date: e.target.value })} />
          </Field>
          <Field label="Semanas">
            <Input
              type="number"
              min={1}
              max={12}
              value={meta.weeks}
              onChange={(e) => setMeta({ ...meta, weeks: Math.min(12, Math.max(1, Number(e.target.value))) })}
            />
          </Field>
          <Field label="Días por semana">
            <Input
              type="number"
              min={1}
              max={6}
              value={meta.days_per_week}
              onChange={(e) => setMeta({ ...meta, days_per_week: Math.min(6, Math.max(1, Number(e.target.value))) })}
            />
          </Field>
        </div>
        <Field label="Objetivo">
          <Input value={meta.goal ?? ""} onChange={(e) => setMeta({ ...meta, goal: e.target.value })} />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Estado">
            <Select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as Program["status"] })}>
              <option value="draft">Borrador (el alumno no lo ve)</option>
              <option value="active">Activo (visible + notificación)</option>
              <option value="archived">Archivado</option>
            </Select>
          </Field>
          <Button onClick={saveMeta}>Guardar</Button>
          <Link href={`/rutina/${meta.id}`}>
            <Button variant="ghost">Ver como alumno</Button>
          </Link>
        </div>
        {metaMsg && <p className="text-sm text-ok">{metaMsg}</p>}
      </Card>

      <div className="-mx-4 mb-3 overflow-x-auto px-4">
        <div className="flex gap-2">
          {Array.from({ length: meta.weeks }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold", w === week ? "bg-brand text-white" : "bg-surface-2 text-muted")}
            >
              Semana {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {week < meta.weeks && (
          <Button size="sm" variant="secondary" onClick={copyWeekForward}>
            Copiar semana {week} a las siguientes
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowCounter(!showCounter)}>
          {showCounter ? "Ocultar" : "Ver"} contador de series
        </Button>
      </div>

      {showCounter && (
        <Card className="mb-4">
          <p className="mb-2 text-sm font-semibold">Series por músculo · semana {week} (directas + indirectas)</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {MUSCLES.map((m) => (
              <div key={m} className="flex justify-between">
                <span className="text-muted">{m}</span>
                <span className={cn("tabular-nums", series[m] === 0 && "text-muted/50")}>{series[m]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <datalist id="exercise-library">
        {library.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>

      <div className="space-y-4">
        {Array.from({ length: meta.days_per_week }, (_, i) => i + 1).map((day) => {
          const dayRows = weekRows.filter((r) => r.day === day).sort((a, b) => a.position - b.position);
          return (
            <section key={day}>
              <h2 className="mb-2 font-display text-xl font-bold uppercase">Día {day}</h2>
              <div className="space-y-2">
                {dayRows.map((row) => (
                  <RowEditor
                    key={row.id}
                    row={row}
                    log={bundle.logs[row.id]}
                    onChange={(c) => patch(row.id, c)}
                    onName={(n) => onNameChange(row, n)}
                    onBlur={() => {
                      const current = rows.find((r) => r.id === row.id);
                      if (current) void saveRow(current);
                    }}
                    onRemove={() => removeRow(row)}
                  />
                ))}
                {dayRows.length < MAX_POS && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => addRow(day)}>
                    + Agregar ejercicio
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function RowEditor({
  row,
  log,
  onChange,
  onName,
  onBlur,
  onRemove,
}: {
  row: Row;
  log?: ProgramBundle["logs"][string];
  onChange: (c: Partial<Row>) => void;
  onName: (n: string) => void;
  onBlur: () => void;
  onRemove: () => void;
}) {
  return (
    <Card className={cn("space-y-2 p-3", row._error && "border-bad")} >
      <div
        className="space-y-2"
        onBlur={(e) => {
          // Guardar solo cuando el foco sale de la fila (no al pasar de un campo a otro)
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
        }}
      >
        <div className="flex items-center gap-2">
          <span className="w-5 text-center font-display text-lg font-bold text-muted">{row.position}</span>
          <Input
            list="exercise-library"
            placeholder="Ejercicio"
            value={row.exercise_name}
            onChange={(e) => onName(e.target.value)}
            className="flex-1"
          />
          <button onClick={onRemove} className="px-2 text-muted hover:text-bad" aria-label="Quitar">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Select className="col-span-2" value={row.category ?? ""} onChange={(e) => onChange({ category: e.target.value || null })}>
            <option value="">Categoría…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input type="number" min={1} max={5} placeholder="Series" value={row.sets} onChange={(e) => onChange({ sets: Number(e.target.value) })} />
          <Input placeholder="Reps (8-10)" value={row.target_reps ?? ""} onChange={(e) => onChange({ target_reps: e.target.value })} />
          <Input placeholder="RIR/RPE" value={row.rir_rpe ?? ""} onChange={(e) => onChange({ rir_rpe: e.target.value })} />
          <Input placeholder="Descanso" value={row.rest ?? ""} onChange={(e) => onChange({ rest: e.target.value })} />
        </div>
        <Textarea
          className="min-h-10 text-sm"
          placeholder="Feedback técnico para el alumno (opcional)"
          value={row.coach_feedback ?? ""}
          onChange={(e) => onChange({ coach_feedback: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          {log?.sets?.length
            ? `Hizo: ${log.sets.map((s) => `${s.reps ?? "-"}×${s.kg ?? "-"}`).join(" · ")} (${tonnage(log.sets)} kg)`
            : "Sin registro del alumno"}
          {log?.student_note && ` · “${log.student_note}”`}
        </span>
        {row._saving ? <Badge>Guardando…</Badge> : row._dirty ? <Badge tone="warn">Sin guardar</Badge> : <Badge tone="ok">✓</Badge>}
      </div>
      {row._error && <ErrorNote>{row._error}</ErrorNote>}
    </Card>
  );
}
