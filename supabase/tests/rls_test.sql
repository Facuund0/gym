-- Pruebas de RLS: correr después de stubs + migración + seed.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000c0ac', 'coach@gym.com', '{"full_name":"Coach"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'ana@gym.com', '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'beto@gym.com', '{"full_name":"Beto"}');
-- el trigger creó los perfiles; promovemos al coach "desde el SQL editor" (auth.uid() nulo)
update public.profiles set role = 'coach' where id = '00000000-0000-0000-0000-00000000c0ac';

-- ===== como COACH =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c0ac', false);
insert into public.programs (id, student_id, coach_id, title, status) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c0ac', 'Ana activo', 'active'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c0ac', 'Ana borrador', 'draft'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000c0ac', 'Beto activo', 'active');
insert into public.program_exercises (id, program_id, week, day, position, exercise_name, category, sets) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 1, 1, 'Sentadilla', 'Cambio de nivel rodilla', 4),
  ('bbbbbbbb-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 1, 1, 1, 'Remo', 'Tracción horizontal', 3);
insert into public.announcements (title, body, author_id) values ('Hola', 'Bienvenidos', '00000000-0000-0000-0000-00000000c0ac');
do $$ begin
  if (select count(*) from public.profiles) <> 3 then raise exception 'coach debería ver 3 perfiles'; end if;
end $$;

-- ===== como ANA (alumna) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  if (select count(*) from public.programs) <> 1 then raise exception 'Ana debería ver solo su programa activo (no borradores ni de otros)'; end if;
  if (select count(*) from public.program_exercises) <> 1 then raise exception 'Ana debería ver solo sus ejercicios'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Ana debería ver solo su perfil'; end if;
  if (select count(*) from public.announcements) <> 1 then raise exception 'Ana debería ver las novedades'; end if;
  if (select count(*) from public.exercises) < 60 then raise exception 'Ana debería ver la biblioteca'; end if;
end $$;
-- puede registrar sus series
insert into public.exercise_logs (program_exercise_id, student_id, sets) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '[{"reps":8,"kg":60}]');
insert into public.session_logs (program_id, student_id, week, day, effort_rpe) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 1, 1, 8);
-- no puede registrar sobre el ejercicio de Beto
do $$ begin
  begin
    insert into public.exercise_logs (program_exercise_id, student_id, sets) values
      ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '[]');
    raise exception 'FALLA: Ana pudo registrar en el programa de Beto';
  exception when insufficient_privilege then null; end;
end $$;
-- no puede hacerse coach
do $$ begin
  begin
    update public.profiles set role = 'coach' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLA: Ana se pudo promover a coach';
  exception when raise_exception then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
end $$;
-- no puede publicar novedades ni crear programas
do $$ begin
  begin
    insert into public.announcements (title) values ('spam');
    raise exception 'FALLA: Ana publicó una novedad';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.programs (student_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'x');
    raise exception 'FALLA: Ana creó un programa';
  exception when insufficient_privilege then null; end;
end $$;
-- puede editar su nombre
update public.profiles set full_name = 'Ana María' where id = '00000000-0000-0000-0000-0000000000a1';

-- ===== como BETO =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
do $$ begin
  if (select count(*) from public.exercise_logs) <> 0 then raise exception 'Beto no debería ver los registros de Ana'; end if;
  if (select count(*) from public.session_logs) <> 0 then raise exception 'Beto no debería ver las sesiones de Ana'; end if;
end $$;

-- ===== COACH ve todo lo registrado =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c0ac', false);
do $$ begin
  if (select count(*) from public.exercise_logs) <> 1 then raise exception 'el coach debería ver los registros'; end if;
end $$;
reset role;
select 'RLS OK' as resultado;
