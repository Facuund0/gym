"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { ProgramBundle } from "@/lib/data";

/**
 * Descarga el programa en la planilla Excel original del gimnasio.
 * Se genera en el navegador (no usa el servidor): baja la plantilla de
 * /templates/planilla.xlsx, completa las celdas y descarga el archivo.
 */
export function ExportPlanillaButton({ bundle, size = "md" }: { bundle: ProgramBundle; size?: "sm" | "md" }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportar() {
    setLoading(true);
    setMsg(null);
    try {
      const { fillPlanilla, planillaFileName } = await import("@/lib/excel/planilla");
      const res = await fetch("/templates/planilla.xlsx");
      if (!res.ok) throw new Error("No se encontró la plantilla");
      const template = await res.arrayBuffer();

      let coachName: string | null = null;
      if (bundle.program.coach_id) {
        const { data } = await createClient().from("profiles").select("full_name").eq("id", bundle.program.coach_id).maybeSingle();
        coachName = data?.full_name ?? null;
      }

      const { bytes, warnings } = await fillPlanilla(template, {
        coachName,
        studentName: bundle.student?.full_name ?? "Alumno",
        goal: bundle.program.goal ?? bundle.student?.goal ?? null,
        startDate: bundle.program.start_date,
        weeks: bundle.program.weeks,
        exercises: bundle.exercises.map((e) => ({
          week: e.week,
          day: e.day,
          position: e.position,
          name: e.exercise_name,
          category: e.category,
          sets: e.sets,
          rir_rpe: e.rir_rpe,
          rest: e.rest,
          target_reps: e.target_reps,
          coach_feedback: e.coach_feedback,
          student_note: bundle.logs[e.id]?.student_note ?? null,
          logged: bundle.logs[e.id]?.sets ?? [],
        })),
        sessions: bundle.sessions,
        feedback: bundle.feedback,
      });

      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = planillaFileName(bundle.student?.full_name ?? "alumno", bundle.program.title);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (warnings.length) setMsg(warnings.join(" "));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" size={size} onClick={exportar} loading={loading}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" strokeLinecap="round" />
        </svg>
        Planilla Excel
      </Button>
      {msg && <span className="max-w-xs text-right text-xs text-warn">{msg}</span>}
    </div>
  );
}
