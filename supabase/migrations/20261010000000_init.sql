-- =====================================================================
-- Gualda Training · esquema inicial
-- Modelo calcado de la "Planilla Gualda": programas de hasta 12 semanas,
-- hasta 6 días por semana, hasta 8 ejercicios por día y hasta 5 series.
-- Correr en Supabase: SQL Editor → pegar → Run  (o `npx supabase db push`).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('coach', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.program_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rules_source as enum ('curated', 'gemini', 'coach');
exception when duplicate_object then null; end $$;

-- Las 20 categorías de la columna "Categoría de ejercicio" de la planilla.
-- Tienen que coincidir EXACTO con la lista de 'Contador de series'!C6:C25
-- para que los SUMIF de la planilla exportada funcionen.
create table if not exists public.exercise_categories (
  name text primary key,
  kind text not null check (kind in ('pattern', 'muscle')),
  sort smallint not null
);

insert into public.exercise_categories (name, kind, sort) values
  ('Empuje horizontal', 'pattern', 1),
  ('Empuje vertical', 'pattern', 2),
  ('Tracción horizontal', 'pattern', 3),
  ('Tracción vertical', 'pattern', 4),
  ('Cambio de nivel rodilla', 'pattern', 5),
  ('Cambio de nivel cadera', 'pattern', 6),
  ('Gemelos', 'muscle', 7),
  ('Cuádriceps', 'muscle', 8),
  ('Isquiosurales', 'muscle', 9),
  ('Abductores', 'muscle', 10),
  ('Aductores', 'muscle', 11),
  ('Glúteo', 'muscle', 12),
  ('Abdominales', 'muscle', 13),
  ('Deltoides anterior', 'muscle', 14),
  ('Deltoides lateral', 'muscle', 15),
  ('Deltoides posterior', 'muscle', 16),
  ('Pectoral', 'muscle', 17),
  ('Espalda', 'muscle', 18),
  ('Bíceps', 'muscle', 19),
  ('Tríceps', 'muscle', 20)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Perfiles (1 a 1 con auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'student',
  goal text,                    -- "Objetivo del alumno" de la planilla
  phone text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente cuando alguien se registra o es invitado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper para las políticas: ¿el usuario actual es entrenador?
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

-- Evita que un alumno se auto-promueva a coach editando su perfil.
create or replace function public.protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() es null cuando el cambio se hace desde el SQL Editor o con la
  -- service key (así promovés al primer entrenador).
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_coach() then
    raise exception 'Solo un entrenador puede cambiar roles';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ---------------------------------------------------------------------
-- Biblioteca de ejercicios
-- ---------------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  aliases text[] not null default '{}',
  category text references public.exercise_categories (name) on update cascade,
  muscles text[] not null default '{}',
  equipment text,
  description text,
  cues text[] not null default '{}',          -- consignas técnicas para mostrar al alumno
  video_url text,
  rule_key text,                              -- clave de un set de reglas curado en src/lib/pose/library
  pose_rules jsonb,                           -- reglas propias (generadas por Gemini o editadas por el coach)
  rules_source public.rules_source,
  rules_reviewed boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercises_name_idx on public.exercises using gin (to_tsvector('spanish', name));

-- ---------------------------------------------------------------------
-- Programas (una "planilla" por alumno)
-- ---------------------------------------------------------------------
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  title text not null default 'Programa',
  goal text,
  start_date date not null default current_date,
  weeks smallint not null default 4 check (weeks between 1 and 12),
  days_per_week smallint not null default 3 check (days_per_week between 1 and 6),
  status public.program_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists programs_student_idx on public.programs (student_id, status);

-- Cada fila = un ejercicio prescripto en (semana, día, posición).
create table if not exists public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  week smallint not null check (week between 1 and 12),
  day smallint not null check (day between 1 and 6),
  position smallint not null check (position between 1 and 8),
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,                -- se guarda el nombre por si el ejercicio se borra
  category text references public.exercise_categories (name) on update cascade,
  sets smallint not null default 3 check (sets between 1 and 5),
  rir_rpe text,                               -- ej. "RIR 2" o "RPE 8"
  rest text,                                  -- ej. "90s" o "2'"
  target_reps text,                           -- ej. "8-10"
  target_kg numeric(6, 2),
  coach_feedback text,                        -- "Feedback Técnico" de la planilla
  unique (program_id, week, day, position)
);

create index if not exists program_exercises_program_idx on public.program_exercises (program_id, week, day);

-- ---------------------------------------------------------------------
-- Registro del alumno
-- ---------------------------------------------------------------------
-- Series realizadas: sets = [{"reps": 10, "kg": 60}, ...] (máximo 5)
create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  program_exercise_id uuid not null unique references public.program_exercises (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  sets jsonb not null default '[]'::jsonb check (jsonb_typeof(sets) = 'array' and jsonb_array_length(sets) <= 5),
  student_note text,                          -- "Notas del alumno"
  updated_at timestamptz not null default now()
);

-- Fila de resumen de cada día (debajo de cada bloque en la planilla)
create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  week smallint not null check (week between 1 and 12),
  day smallint not null check (day between 1 and 6),
  duration_min smallint check (duration_min between 0 and 600),
  doms smallint check (doms between 1 and 10),
  muscle_group text,
  weigh_in_kg numeric(5, 2),
  effort_rpe smallint check (effort_rpe between 5 and 10),
  completed_at timestamptz not null default now(),
  unique (program_id, week, day)
);

-- Hoja "Feedback del alumno y pesaje"
create table if not exists public.weekly_feedback (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  week smallint not null check (week between 1 and 12),
  motivation smallint check (motivation between 1 and 10),
  perceived_effort smallint check (perceived_effort between 1 and 10),
  most_stimulated text,
  best_recovered text,
  favorite_exercises text,
  disliked_exercises text,
  stress smallint check (stress between 1 and 10),
  sleep_hours numeric(4, 1),
  sleep_quality smallint check (sleep_quality between 1 and 10),
  foods_bad text,
  satiety smallint check (satiety between 1 and 10),
  hungry_meals text,
  full_meals text,
  created_at timestamptz not null default now(),
  unique (program_id, week)
);

-- Resultado de cada sesión de corrección con cámara. NO se guarda video:
-- la detección corre en el teléfono y solo se sube este resumen.
create table if not exists public.form_checks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,
  program_exercise_id uuid references public.program_exercises (id) on delete set null,
  reps smallint not null default 0,
  score smallint check (score between 0 and 100),
  duration_s integer,
  issues jsonb not null default '[]'::jsonb,   -- [{"id":"depth","message":"...","count":3}]
  ai_review text,                              -- devolución opcional de Gemini
  created_at timestamptz not null default now()
);

create index if not exists form_checks_student_idx on public.form_checks (student_id, created_at desc);

-- ---------------------------------------------------------------------
-- Novedades y notificaciones
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  title text not null,
  body text not null default '',
  image_url text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Control de uso de Gemini para no quemar la cuota gratuita
create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('rules', 'review')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, created_at);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists programs_touch on public.programs;
create trigger programs_touch before update on public.programs
  for each row execute function public.touch_updated_at();

drop trigger if exists exercises_touch on public.exercises;
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

drop trigger if exists exercise_logs_touch on public.exercise_logs;
create trigger exercise_logs_touch before update on public.exercise_logs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.exercise_categories enable row level security;
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_exercises enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.session_logs enable row level security;
alter table public.weekly_feedback enable row level security;
alter table public.form_checks enable row level security;
alter table public.announcements enable row level security;
alter table public.push_tokens enable row level security;
alter table public.ai_usage enable row level security;

-- Categorías: lectura para cualquiera logueado
drop policy if exists "categorias lectura" on public.exercise_categories;
create policy "categorias lectura" on public.exercise_categories
  for select to authenticated using (true);

-- Perfiles
drop policy if exists "perfil propio o coach lee" on public.profiles;
create policy "perfil propio o coach lee" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_coach());

drop policy if exists "perfil propio o coach edita" on public.profiles;
create policy "perfil propio o coach edita" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_coach())
  with check (id = auth.uid() or public.is_coach());

-- Ejercicios: todos leen, el coach administra
drop policy if exists "ejercicios lectura" on public.exercises;
create policy "ejercicios lectura" on public.exercises
  for select to authenticated using (true);

drop policy if exists "ejercicios coach" on public.exercises;
create policy "ejercicios coach" on public.exercises
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Programas
drop policy if exists "programas alumno lee" on public.programs;
create policy "programas alumno lee" on public.programs
  for select to authenticated using (
    public.is_coach() or (student_id = auth.uid() and status <> 'draft')
  );

drop policy if exists "programas coach" on public.programs;
create policy "programas coach" on public.programs
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Ejercicios del programa
drop policy if exists "prescripcion lectura" on public.program_exercises;
create policy "prescripcion lectura" on public.program_exercises
  for select to authenticated using (
    public.is_coach() or exists (
      select 1 from public.programs p
      where p.id = program_id and p.student_id = auth.uid() and p.status <> 'draft'
    )
  );

drop policy if exists "prescripcion coach" on public.program_exercises;
create policy "prescripcion coach" on public.program_exercises
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Registros del alumno: el alumno maneja los suyos, el coach lee todo
drop policy if exists "logs ejercicio" on public.exercise_logs;
create policy "logs ejercicio" on public.exercise_logs
  for all to authenticated
  using (student_id = auth.uid() or public.is_coach())
  with check (
    student_id = auth.uid() and exists (
      select 1 from public.program_exercises pe
      join public.programs p on p.id = pe.program_id
      where pe.id = program_exercise_id and p.student_id = auth.uid()
    )
  );

drop policy if exists "logs sesion" on public.session_logs;
create policy "logs sesion" on public.session_logs
  for all to authenticated
  using (student_id = auth.uid() or public.is_coach())
  with check (
    student_id = auth.uid() and exists (
      select 1 from public.programs p where p.id = program_id and p.student_id = auth.uid()
    )
  );

drop policy if exists "feedback semanal" on public.weekly_feedback;
create policy "feedback semanal" on public.weekly_feedback
  for all to authenticated
  using (student_id = auth.uid() or public.is_coach())
  with check (
    student_id = auth.uid() and exists (
      select 1 from public.programs p where p.id = program_id and p.student_id = auth.uid()
    )
  );

drop policy if exists "form checks" on public.form_checks;
create policy "form checks" on public.form_checks
  for all to authenticated
  using (student_id = auth.uid() or public.is_coach())
  with check (student_id = auth.uid());

-- Novedades
drop policy if exists "novedades lectura" on public.announcements;
create policy "novedades lectura" on public.announcements
  for select to authenticated using (true);

drop policy if exists "novedades coach" on public.announcements;
create policy "novedades coach" on public.announcements
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Tokens push: cada uno los suyos (el envío usa la service key en el servidor)
drop policy if exists "tokens propios" on public.push_tokens;
create policy "tokens propios" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_usage: solo lectura propia; las escrituras las hace el servidor con service key
drop policy if exists "uso ia propio" on public.ai_usage;
create policy "uso ia propio" on public.ai_usage
  for select to authenticated using (user_id = auth.uid() or public.is_coach());

-- ---------------------------------------------------------------------
-- Storage: imágenes de novedades y medios de ejercicios
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media lectura" on storage.objects;
create policy "media lectura" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media coach sube" on storage.objects;
create policy "media coach sube" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_coach());

drop policy if exists "media coach borra" on storage.objects;
create policy "media coach borra" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_coach());
