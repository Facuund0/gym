# Roadmap

Estado al 10/10/2026. Cada ítem tiene tamaño estimado (S < 2 h, M ≈ medio día, L ≈ 1-2 días) y criterio de "hecho". Trabajar de arriba hacia abajo salvo que Facundo pida otra cosa.

## ✅ Hecho (v0.1)

- Next.js 16 + Supabase (esquema, RLS probado, seed de 66 ejercicios) + PWA instalable.
- Roles entrenador/alumno, invitación por mail, login con contraseña o link.
- Entrenador: alumnos, programas (12 sem × 6 días × 8 ejercicios × 5 series), copiar semana, contador de series por músculo, activar con notificación, biblioteca de ejercicios con reglas de técnica (biblioteca, IA o JSON propio).
- Alumno: rutina del día, registro de series con "semana anterior", temporizador de descanso, resumen del día (duración, RPE, DOMS, pesaje), feedback semanal, progreso (tonelaje, peso, series por músculo, historial de técnica).
- Corrección con cámara: 14 sets de reglas curadas, voz en castellano, puntaje por repetición, modo automático, reglas generadas con Gemini, devolución por fotos con consentimiento.
- Novedades con imagen y push (Firebase).
- Exportación a la planilla Excel original (con 3 errores de fórmulas corregidos).
- 22 tests (motor + planilla) y pruebas de RLS.

## 🔜 Próximo (prioridad alta)

1. **Poner en producción y probar con 2-3 alumnos reales** (M). Seguir `docs/setup.md`. Hecho = un alumno completó una semana desde el celular y el coach exportó la planilla.
2. **Calibrar las reglas con videos del gimnasio** (L). Construir `/coach/calibrar`: graba la serie temporal de métricas (no video) mientras alguien hace el ejercicio y muestra gráficos con los umbrales; botón para ajustar y guardar como reglas propias. Hecho = sentadilla, peso muerto rumano y flexiones calibradas con ≥ 5 personas.
3. **Mover MediaPipe a un Web Worker** (M) para que la UI no se trabe en celulares de gama baja (OffscreenCanvas + `postMessage` de landmarks). Hecho = 25+ fps con modelo lite en un Android de gama media.
4. **Alojar el modelo y el WASM localmente** (S): script `scripts/fetch-mediapipe.mjs` que copie `node_modules/@mediapipe/tasks-vision/wasm` (solo los archivos SIMD) y baje `pose_landmarker_lite.task` a `public/`, y setear `NEXT_PUBLIC_POSE_MODEL_URL`.
5. **Términos y política de privacidad** (S): página `/legal` y aceptación al primer ingreso (Ley 25.326). Hecho = el alumno no puede usar la cámara sin aceptar.
6. **Recordatorios automáticos** (M): cron de Vercel (en el plan Hobby, una corrida diaria alcanza) (`vercel.json` → `/api/cron/recordatorios`) que avise a quien tiene entrenamiento hoy y no lo registró, y el domingo pida el feedback semanal. Proteger con `CRON_SECRET`.

## 💡 Ideas para sumar (prioridad media)

- **Asistencia con QR** (M): QR en la recepción; el alumno lo escanea al llegar → `check_ins`. El coach ve quién vino y rachas.
- **Récords personales** (S): detectar PR de peso por ejercicio y repeticiones (fórmula de Epley para 1RM estimado) y festejarlo con confeti y push al coach.
- **Progresión sugerida** (M): con el RIR/RPE registrado, sugerir kg para la semana siguiente (ej. +2,5 kg si sobró RIR). El coach aprueba.
- **Videos por ejercicio** (S): mostrar `video_url` y las consignas antes de empezar la serie y en la pantalla de técnica.
- **Chat o comentarios coach ↔ alumno por ejercicio** (M) con Supabase Realtime.
- **Plantillas de programas** (S): guardar programas como plantilla (sin alumno) y asignarlos a varios.
- **Importar desde la planilla** (M): leer un .xlsx con el formato de la planilla GymRun y crear el programa (inverso de la exportación).
- **Ranking/desafíos mensuales** (M): tonelaje del mes, asistencia; opt-in para no exponer a nadie.
- **Pagos y vencimiento de cuota** (L): estado de cuota por alumno, aviso de vencimiento; integración con Mercado Pago más adelante.
- **Reservas de turnos/clases** (L) con cupos.
- **Modo TV** (S): pantalla para la tele del gimnasio con novedades y el ranking.
- **Vista frontal + lateral combinadas** (L): dos teléfonos o pedir dos series, como sugiere el paper FLEX (mejora mucho la evaluación).
- **Clasificador entrenado** (L): con datos de calibración propios, entrenar un modelo liviano sobre landmarks para errores difíciles (ver `docs/motor-de-tecnica.md`).

## 🧹 Deuda técnica

- Generar tipos de Supabase (`npm run db:types`) y tipar los clientes con `Database`.
- Tests de componentes (Playwright) para el flujo alumno: login → rutina → cargar series → terminar día.
- Paginación en novedades y en la lista de alumnos cuando crezcan.
- Manejo offline del registro de series (cola en IndexedDB y sincronización al volver la red).
- Revisar accesibilidad (contraste del modo claro, tamaños táctiles, lectores de pantalla).
