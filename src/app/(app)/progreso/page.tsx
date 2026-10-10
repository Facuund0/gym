"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { BarChart } from "@/components/charts/BarChart";
import { Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { MUSCLES, seriesByMuscle } from "@/lib/categories";
import { currentWeek, fetchActiveProgram, fetchFormChecks, fetchProgramBundle, formatKg, tonnage, type ProgramBundle } from "@/lib/data";
import type { FormCheck } from "@/lib/types";

export default function ProgresoPage() {
  const { profile } = useProfile();
  const [bundle, setBundle] = useState<ProgramBundle | null | undefined>(undefined);
  const [checks, setChecks] = useState<FormCheck[]>([]);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      const p = await fetchActiveProgram(profile.id);
      setBundle(p ? await fetchProgramBundle(p.id) : null);
    })();
    void fetchFormChecks(profile.id, 30).then(setChecks);
  }, [profile]);

  if (bundle === undefined) return <Loading />;
  if (!bundle) return <EmptyState title="Todavía no hay datos de progreso" />;

  const weeks = Array.from({ length: bundle.program.weeks }, (_, i) => i + 1);
  const tonnageByWeek = weeks.map((w) =>
    bundle.exercises.filter((e) => e.week === w).reduce((acc, e) => acc + tonnage(bundle.logs[e.id]?.sets), 0),
  );
  const weightByWeek = weeks.map((w) => {
    const ws = bundle.sessions.filter((s) => s.week === w && s.weigh_in_kg).map((s) => Number(s.weigh_in_kg));
    return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : 0;
  });
  const cw = currentWeek(bundle.program);
  const series = seriesByMuscle(bundle.exercises.filter((e) => e.week === cw));
  const maxSeries = Math.max(1, ...MUSCLES.map((m) => series[m]));

  return (
    <>
      <PageHeader title="Progreso" subtitle={bundle.program.title} />
      <div className="space-y-4">
        <Card>
          <p className="mb-1 font-semibold">Tonelaje por semana</p>
          <p className="mb-3 text-xs text-muted">Suma de repeticiones × kilos de todas tus series.</p>
          <BarChart labels={weeks.map((w) => `S${w}`)} values={tonnageByWeek} format={(v) => formatKg(v)} highlight={cw - 1} />
        </Card>

        {weightByWeek.some((v) => v > 0) && (
          <Card>
            <p className="mb-3 font-semibold">Peso promedio por semana</p>
            <BarChart labels={weeks.map((w) => `S${w}`)} values={weightByWeek} format={(v) => (v ? formatKg(v) : "–")} highlight={cw - 1} relative />
          </Card>
        )}

        <Card>
          <p className="mb-1 font-semibold">Series por músculo · semana {cw}</p>
          <p className="mb-3 text-xs text-muted">Incluye las series indirectas de los patrones (como el contador de la planilla).</p>
          <div className="space-y-1.5">
            {MUSCLES.filter((m) => series[m] > 0).map((m) => (
              <div key={m} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="truncate text-muted">{m}</span>
                <div className="h-2.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(series[m] / maxSeries) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{series[m]}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="mb-3 font-semibold">Historial de técnica</p>
          {checks.length === 0 ? (
            <p className="text-sm text-muted">Todavía no usaste la corrección con cámara.</p>
          ) : (
            <ul className="divide-y divide-border">
              {checks.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium">{c.exercise_name}</p>
                    <p className="text-xs text-muted">
                      {new Date(c.created_at).toLocaleDateString("es-AR")} · {c.reps} reps
                      {c.issues?.[0] ? ` · ${c.issues[0].label}` : ""}
                    </p>
                  </div>
                  <span className="font-display text-2xl font-bold text-brand">{c.score ?? "–"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
