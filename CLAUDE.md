# Gualda Training — app del gimnasio

@AGENTS.md

PWA para el gimnasio Gualda Training (Sunchales, Santa Fe, Argentina). El entrenador carga rutinas y novedades; los alumnos ven su rutina, registran series y usan la **cámara para corregir la técnica en vivo**. Se puede descargar cada programa en la planilla Excel original del gimnasio.

Dueño del proyecto: Facundo (estudiante de ICES, habla español rioplatense). **Respondé y escribí la UI en español rioplatense (vos)**. Comentarios de código en español.

## Stack

- **Next.js 16.4** (App Router, Turbopack, React 19.3) — ¡no es el Next que conocés! Ver `AGENTS.md`: leé `node_modules/next/dist/docs/` antes de usar APIs de Next. `middleware.ts` ahora es `src/proxy.ts`. `params`/`searchParams` son Promises. `cacheComponents` está **apagado a propósito** (ver `next.config.ts`).
- **Supabase**: Postgres + Auth + Storage, con RLS en todas las tablas. Claves nuevas: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` (no "anon"/"service_role").
- **MediaPipe Pose Landmarker** (`@mediapipe/tasks-vision`) en el navegador, modelo lite.
- **Gemini** (`@google/genai`) solo del lado servidor y solo fuera del tiempo real.
- **Firebase Cloud Messaging** para push (cliente `firebase`, servidor `firebase-admin`).
- **Tailwind CSS v4** (tokens en `src/app/globals.css`), **zod 4**, **jszip**, **vitest**.
- Deploy en **Vercel**.

## Comandos

```bash
npm run dev         # desarrollo (la cámara necesita https o localhost)
npm run build       # build de producción (tiene que pasar antes de cada commit)
npm test            # vitest: motor de pose + exportación de planilla
npm run lint        # eslint (incluye reglas del React Compiler)
npm run typecheck   # tsc --noEmit
python3 scripts/generate-seed.py   # regenera supabase/seed.sql
```

Antes de dar algo por terminado: `npm run typecheck && npm run lint && npm test && npm run build`.

## Mapa del código

```
src/proxy.ts                         refresca sesión de Supabase y manda a /login
src/app/(app)/                       pantallas logueadas (AppShell + ProfileProvider)
  inicio/  rutina/[programId]/  tecnica/[slug]/  novedades/  progreso/  perfil/
  coach/alumnos/  coach/programas/[id]/  coach/ejercicios/
src/app/api/                         route handlers (siempre verificar sesión con getSessionUser)
  exercises/rules   form-review   push/send   announcements   students/invite
src/lib/pose/                        MOTOR DE TÉCNICA (sin React, testeable)
  schema.ts      formato JSON de reglas (zod) + JSON Schema para Gemini
  library/       reglas curadas + alias de nombres en castellano
  analyzer.ts    FormAnalyzer: cuadro a cuadro → reps, fases, errores, consignas
  repCounter.ts  máquina de estados con histéresis
  auto.ts        modo automático para ejercicios sin reglas
  resolve.ts     prioridad: reglas propias → biblioteca → alias → nada
src/components/pose/FormCoach.tsx    cámara + esqueleto + voz + resumen
src/lib/excel/                       exportación sobre public/templates/planilla.xlsx
src/lib/gemini/server.ts             generación de reglas y devolución por fotos
src/lib/firebase/                    push (client.ts / admin.ts) + public/sw.js
supabase/migrations/                 esquema + RLS (fuente de verdad del modelo)
supabase/seed.sql                    66 ejercicios iniciales con categoría y reglas
supabase/tests/                      pruebas de RLS contra Postgres
docs/                                investigación, setup, motor, roadmap
```

## Reglas del proyecto

**Datos y seguridad**
- Toda tabla nueva lleva RLS. El cliente usa `src/lib/supabase/client.ts` y depende de RLS; `createAdminClient()` (secret key) solo en servidor y solo cuando hace falta saltear RLS.
- Los route handlers re-verifican la sesión y el rol con `getSessionUser()`; nunca confiar en el cliente.
- Si cambiás el esquema: nueva migración en `supabase/migrations/` (no edites la inicial si ya se aplicó en producción), actualizá `src/lib/types.ts` y, si aplica, `supabase/tests/rls_test.sql`.

**Modelo de la planilla** (no romperlo)
- Límites: 12 semanas, 6 días, 8 ejercicios por día, 5 series.
- Las 20 categorías (`src/lib/categories.ts` = tabla `exercise_categories`) tienen que coincidir EXACTO con la planilla: el "Contador de series" suma con SUMIF por texto.
- El mapa de celdas está documentado arriba de `src/lib/excel/planilla.ts`. La Semana 1 tiene una fila más que las semanas 2-12. Se edita el XML de la plantilla (no usar exceljs: rompe el formato condicional y el logo).

**Motor de técnica**
- El bucle de tiempo real corre 100% en el dispositivo. **Nunca** mandar video ni llamar a Gemini por cuadro.
- Reglas nuevas: seguir `docs/motor-de-tecnica.md` y la skill `.claude/skills/nuevo-ejercicio-tecnica`. Cada set de reglas nuevo lleva un test con datos sintéticos en `tests/pose.test.ts`.
- Umbrales tolerantes; consignas cortas, imperativas, en voseo; sin mitos de entrenamiento.
- Ángulos en espacio de imagen corregido por aspecto (`x * ancho/alto`).

**Gemini**
- Modelos por env (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`); por defecto `gemini-3.8-flash` y `gemini-3.5-flash-lite`. Verificá nombres vigentes en https://ai.google.dev/gemini-api/docs/models antes de cambiarlos.
- Plan gratuito = Google puede usar el contenido. Fotos de alumnos solo con consentimiento explícito.
- Respetar los límites diarios de `src/lib/ai-usage.ts`.

**UI**
- Mobile first (se usa con el teléfono en el gimnasio), tema oscuro por defecto, colores de marca rosa `#DF5A86` y bordó `#9C1944`.
- Componentes base en `src/components/ui.tsx`; no agregar librerías de UI sin necesidad.
- Lint del React Compiler activo: nada de `Date.now()` en render, nada de leer refs en render, nada de `setState` sincrónico en efectos (cargar datos con `.then(setX)`).

## Documentación

- `docs/investigacion.md` — por qué está hecho así (pose, datasets, Gemini, push, costos, legal).
- `docs/setup.md` — cómo levantar Supabase, Firebase, Gemini y Vercel desde cero.
- `docs/motor-de-tecnica.md` — formato de reglas, cómo agregar ejercicios, calibración.
- `docs/roadmap.md` — próximos pasos priorizados. **Empezá por acá si te piden "seguir".**

## Compact instructions

Al compactar, conservá: qué tarea del roadmap se está haciendo, archivos tocados, resultados de tests/build y decisiones tomadas.
