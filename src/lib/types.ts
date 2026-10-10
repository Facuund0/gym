// Tipos de las tablas (escritos a mano, alineados con supabase/migrations).
// Para generarlos automáticamente: npm run db:types (ver docs/setup.md).

export type Role = "coach" | "student";
export type ProgramStatus = "draft" | "active" | "archived";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  goal: string | null;
  phone: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  category: string | null;
  muscles: string[];
  equipment: string | null;
  description: string | null;
  cues: string[];
  video_url: string | null;
  rule_key: string | null;
  pose_rules: unknown | null;
  rules_source: "curated" | "gemini" | "coach" | null;
  rules_reviewed: boolean;
  created_at: string;
}

export interface Program {
  id: string;
  student_id: string;
  coach_id: string | null;
  title: string;
  goal: string | null;
  start_date: string;
  weeks: number;
  days_per_week: number;
  status: ProgramStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramExercise {
  id: string;
  program_id: string;
  week: number;
  day: number;
  position: number;
  exercise_id: string | null;
  exercise_name: string;
  category: string | null;
  sets: number;
  rir_rpe: string | null;
  rest: string | null;
  target_reps: string | null;
  target_kg: number | null;
  coach_feedback: string | null;
}

export interface LoggedSet {
  reps: number | null;
  kg: number | null;
}

export interface ExerciseLog {
  id: string;
  program_exercise_id: string;
  student_id: string;
  sets: LoggedSet[];
  student_note: string | null;
  updated_at: string;
}

export interface SessionLog {
  id: string;
  program_id: string;
  student_id: string;
  week: number;
  day: number;
  duration_min: number | null;
  doms: number | null;
  muscle_group: string | null;
  weigh_in_kg: number | null;
  effort_rpe: number | null;
  completed_at: string;
}

export interface WeeklyFeedback {
  id: string;
  program_id: string;
  student_id: string;
  week: number;
  motivation: number | null;
  perceived_effort: number | null;
  most_stimulated: string | null;
  best_recovered: string | null;
  favorite_exercises: string | null;
  disliked_exercises: string | null;
  stress: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  foods_bad: string | null;
  satiety: number | null;
  hungry_meals: string | null;
  full_meals: string | null;
}

export interface FormCheck {
  id: string;
  student_id: string;
  exercise_id: string | null;
  exercise_name: string;
  program_exercise_id: string | null;
  reps: number;
  score: number | null;
  duration_s: number | null;
  issues: Array<{ id: string; label: string; message: string; count: number }>;
  ai_review: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  author_id: string | null;
  title: string;
  body: string;
  image_url: string | null;
  pinned: boolean;
  created_at: string;
}
