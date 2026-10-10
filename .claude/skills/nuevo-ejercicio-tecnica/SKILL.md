---
name: nuevo-ejercicio-tecnica
description: Agregar o ajustar reglas curadas de detección de técnica (cámara) para un ejercicio del gimnasio, con alias en castellano y tests. Usar cuando pidan "agregá la detección para X", "la app no corrige bien Y" o "ajustá los umbrales de Z".
---

# Agregar o ajustar reglas de técnica

Contexto obligatorio: `docs/motor-de-tecnica.md` (formato de reglas y métricas) y `src/lib/pose/library/index.ts` (ejemplos reales).

## Pasos

1. **Entender el ejercicio**: plano de movimiento (¿costado o frente?), métrica principal más estable (normalmente un ángulo articular grande), errores frecuentes que se puedan ver con los 33 puntos de MediaPipe. No inventar chequeos de columna (no hay puntos en la espalda) ni mitos.
2. **¿Ya existe un set parecido?** Si el ejercicio es una variante (ej. "sentadilla hack" ≈ squat), alcanza con sumar un alias en `ALIASES`. Gana el alias más largo contenido en el nombre normalizado (sin tildes, minúsculas).
3. **Escribir el `RuleSet`** en `RULES`:
   - `start`/`end` con margen (histéresis); `target_end`/`target_start` más exigentes y con mensaje.
   - `eccentric_phase`: `to_end` si la bajada va hacia `end`, `to_start` si no.
   - Máximo 4 chequeos, `hold_ms` ≥ 250, severidad `error` solo para riesgos reales.
   - Mensajes en voseo, imperativos, ≤ 70 caracteres (se leen en voz alta).
   - `setup_hint` claro: dónde poner el teléfono.
4. **Tests** en `tests/pose.test.ts` usando `tests/helpers/synthetic.ts` (extender el muñeco si hace falta, por ejemplo brazos para un press):
   - cuenta N repeticiones limpias sin errores,
   - marca al menos un error característico,
   - los alias resuelven al nuevo `key`.
5. **Seed**: si el ejercicio está en `scripts/generate-seed.py`, poner su `rule_key` y correr `python3 scripts/generate-seed.py`. Recordar que en una base ya cargada hay que actualizar la fila con un `update` (el seed no pisa filas existentes).
6. **Verificar**: `npm test && npm run typecheck && npm run lint`.
7. **Avisar a Facundo** que lo pruebe con la cámara en un celular real (de costado y de frente) antes de darlo por bueno, y que las reglas son un punto de partida a calibrar.
