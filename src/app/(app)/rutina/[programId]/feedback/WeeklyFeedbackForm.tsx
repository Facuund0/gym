"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Button, ErrorNote, Field, Input, Loading, PageHeader, Textarea, cn } from "@/components/ui";
import { saveWeeklyFeedback } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { WeeklyFeedback } from "@/lib/types";

type Form = Omit<WeeklyFeedback, "id" | "program_id" | "student_id" | "week">;

const EMPTY: Form = {
  motivation: null,
  perceived_effort: null,
  most_stimulated: null,
  best_recovered: null,
  favorite_exercises: null,
  disliked_exercises: null,
  stress: null,
  sleep_hours: null,
  sleep_quality: null,
  foods_bad: null,
  satiety: null,
  hungry_meals: null,
  full_meals: null,
};

// Mismas preguntas que la hoja "Feedback del alumno y pesaje" de la planilla.
const SCALES: Array<[keyof Form, string]> = [
  ["motivation", "Motivación para entrenar"],
  ["perceived_effort", "Esfuerzo percibido general"],
  ["stress", "Niveles de estrés"],
  ["sleep_quality", "Calidad del sueño"],
  ["satiety", "Saciedad durante el día"],
];

const TEXTS: Array<[keyof Form, string, string]> = [
  ["most_stimulated", "Músculos más estimulados", "Ej: cuádriceps y glúteos"],
  ["best_recovered", "Músculos que mejor se recuperaron", ""],
  ["favorite_exercises", "Ejercicios favoritos", ""],
  ["disliked_exercises", "Ejercicios que no te gustaron", ""],
  ["foods_bad", "Comidas que te cayeron mal", ""],
  ["hungry_meals", "Comidas donde tenés hambre", "Ej: merienda"],
  ["full_meals", "Comidas donde te llenás", ""],
];

export function WeeklyFeedbackForm({ programId }: { programId: string }) {
  const { profile } = useProfile();
  const router = useRouter();
  const week = Number(useSearchParams().get("semana") ?? 1);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void createClient()
      .from("weekly_feedback")
      .select("*")
      .eq("program_id", programId)
      .eq("week", week)
      .maybeSingle()
      .then(({ data }) => setForm(data ? { ...EMPTY, ...(data as WeeklyFeedback) } : EMPTY));
  }, [programId, week]);

  if (!form || !profile) return <Loading />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  async function save() {
    if (!form || !profile) return;
    setSaving(true);
    // Solo las columnas del formulario (el estado puede traer id/created_at de la base).
    const clean = Object.fromEntries((Object.keys(EMPTY) as Array<keyof Form>).map((k) => [k, form[k]])) as Form;
    const err = await saveWeeklyFeedback({ ...clean, program_id: programId, student_id: profile.id, week });
    setSaving(false);
    if (err) setError(err);
    else router.replace(`/rutina/${programId}?semana=${week}`);
  }

  return (
    <>
      <PageHeader title={`Semana ${week}`} subtitle="¿Cómo te sentiste? Tu entrenador usa esto para ajustar el plan." />
      <div className="space-y-5">
        {SCALES.map(([k, label]) => (
          <div key={k}>
            <p className="mb-1 text-sm font-medium text-muted">{label} (1-10)</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => set(k, n as never)}
                  className={cn(
                    "size-10 rounded-lg text-sm font-semibold",
                    form[k] === n ? "bg-brand text-white" : "bg-surface-2 text-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        <Field label="Horas de sueño por noche (promedio)">
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            value={form.sleep_hours ?? ""}
            onChange={(e) => set("sleep_hours", e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        {TEXTS.map(([k, label, ph]) => (
          <Field key={k} label={label}>
            <Textarea
              className="min-h-14"
              placeholder={ph}
              value={(form[k] as string | null) ?? ""}
              onChange={(e) => set(k, (e.target.value || null) as never)}
            />
          </Field>
        ))}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button size="lg" className="w-full" onClick={save} loading={saving}>
          Enviar
        </Button>
      </div>
    </>
  );
}
