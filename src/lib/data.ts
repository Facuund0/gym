"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  Announcement,
  ExerciseLog,
  FormCheck,
  LoggedSet,
  Profile,
  Program,
  ProgramExercise,
  SessionLog,
  WeeklyFeedback,
} from "@/lib/types";

/*
  Acceso a datos desde el cliente. Todas las consultas pasan por RLS:
  un alumno solo ve lo suyo y el coach ve todo. Si algo devuelve vacío
  inesperadamente, revisar primero las políticas en supabase/migrations.
*/

export interface ProgramBundle {
  program: Program;
  student: Pick<Profile, "id" | "full_name" | "goal"> | null;
  exercises: ProgramExercise[];
  logs: Record<string, ExerciseLog>; // por program_exercise_id
  sessions: SessionLog[];
  feedback: WeeklyFeedback[];
}

const sb = () => createClient();

export async function fetchActiveProgram(studentId: string): Promise<Program | null> {
  const { data } = await sb()
    .from("programs")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Program) ?? null;
}

export async function fetchPrograms(studentId: string): Promise<Program[]> {
  const { data } = await sb()
    .from("programs")
    .select("*")
    .eq("student_id", studentId)
    .order("start_date", { ascending: false });
  return (data as Program[]) ?? [];
}

export async function fetchProgramBundle(programId: string): Promise<ProgramBundle | null> {
  const client = sb();
  const { data: program } = await client.from("programs").select("*").eq("id", programId).maybeSingle();
  if (!program) return null;
  const [{ data: student }, { data: exercises }, { data: sessions }, { data: feedback }] = await Promise.all([
    client.from("profiles").select("id, full_name, goal").eq("id", program.student_id).maybeSingle(),
    client.from("program_exercises").select("*").eq("program_id", programId).order("week").order("day").order("position"),
    client.from("session_logs").select("*").eq("program_id", programId),
    client.from("weekly_feedback").select("*").eq("program_id", programId),
  ]);
  const ids = (exercises ?? []).map((e) => e.id);
  const logs: Record<string, ExerciseLog> = {};
  if (ids.length) {
    // en tandas para no armar URLs gigantes
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await client.from("exercise_logs").select("*").in("program_exercise_id", ids.slice(i, i + 150));
      for (const l of (data as ExerciseLog[]) ?? []) logs[l.program_exercise_id] = l;
    }
  }
  return {
    program: program as Program,
    student: student ?? null,
    exercises: (exercises as ProgramExercise[]) ?? [],
    logs,
    sessions: (sessions as SessionLog[]) ?? [],
    feedback: (feedback as WeeklyFeedback[]) ?? [],
  };
}

export async function saveExerciseLog(
  programExerciseId: string,
  studentId: string,
  sets: LoggedSet[],
  note: string | null,
): Promise<string | null> {
  const { error } = await sb()
    .from("exercise_logs")
    .upsert(
      { program_exercise_id: programExerciseId, student_id: studentId, sets: sets.slice(0, 5), student_note: note },
      { onConflict: "program_exercise_id" },
    );
  return error?.message ?? null;
}

export async function saveSessionLog(row: Omit<SessionLog, "id" | "completed_at">): Promise<string | null> {
  const { error } = await sb().from("session_logs").upsert(row, { onConflict: "program_id,week,day" });
  return error?.message ?? null;
}

export async function saveWeeklyFeedback(row: Omit<WeeklyFeedback, "id">): Promise<string | null> {
  const { error } = await sb().from("weekly_feedback").upsert(row, { onConflict: "program_id,week" });
  return error?.message ?? null;
}

export async function fetchAnnouncements(limit = 30): Promise<Announcement[]> {
  const { data } = await sb()
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Announcement[]) ?? [];
}

export async function fetchFormChecks(studentId: string, limit = 20): Promise<FormCheck[]> {
  const { data } = await sb()
    .from("form_checks")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as FormCheck[]) ?? [];
}

/** Semana actual del programa según la fecha de inicio (1..weeks). */
export function currentWeek(program: Pick<Program, "start_date" | "weeks">, today = new Date()): number {
  const start = new Date(`${program.start_date}T00:00:00`);
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const w = Math.floor(days / 7) + 1;
  return Math.min(program.weeks, Math.max(1, w));
}

/** Próximo día sin completar en la semana dada. */
export function nextDay(bundle: Pick<ProgramBundle, "program" | "sessions" | "exercises">, week: number): number {
  const daysWithExercises = Array.from(
    new Set(bundle.exercises.filter((e) => e.week === week).map((e) => e.day)),
  ).sort((a, b) => a - b);
  const done = new Set(bundle.sessions.filter((s) => s.week === week).map((s) => s.day));
  return daysWithExercises.find((d) => !done.has(d)) ?? daysWithExercises[0] ?? 1;
}

/** Tonelaje = suma de reps × kg (igual que la columna "Tonelaje" de la planilla). */
export function tonnage(sets: LoggedSet[] | undefined): number {
  return (sets ?? []).reduce((acc, s) => acc + (s.reps ?? 0) * (s.kg ?? 0), 0);
}

export function formatKg(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`;
}
