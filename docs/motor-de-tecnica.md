# Motor de técnica

Cómo funciona la corrección con cámara y cómo ampliarla.

## Flujo por cuadro

```
cámara ──► MediaPipe Pose (33 puntos) ──► suavizado One Euro ──► elegir lado visible
                                                                  │
         ┌────────────────────────────────────────────────────────┘
         ▼
  ¿se ven las articulaciones requeridas? ── no ──► "Acomodá el teléfono: no veo las rodillas"
         │ sí
         ▼
  métrica principal ──► RepCounter (histéresis) ──► rep completa / parcial
         │
         ▼
  chequeos (min/max por fase, sostenidos hold_ms) ──► consigna por voz (CueGate)
         │
         ▼
  al completar la rep: profundidad, extensión, tempo, rango (max_range) → puntaje 0-100
```

Todo vive en `src/lib/pose/` sin dependencias de React, así se testea con datos sintéticos (`tests/helpers/synthetic.ts`).

## Formato de reglas (`RuleSet`)

```jsonc
{
  "version": 1,
  "key": "squat",
  "name": "Sentadilla (vista lateral)",
  "view": "side",            // side | front | either
  "side": "auto",            // auto = el lado más visible
  "mode": "reps",            // reps | hold (isométricos)
  "setup_hint": "Apoyá el teléfono de costado...",
  "required": ["shoulder", "hip", "knee", "ankle"],
  "rep": {
    "metric": { "kind": "angle", "a": "hip", "b": "knee", "c": "ankle" },
    "start": 160,            // posición inicial (parado)
    "end": 120,              // hay que cruzarlo para que cuente
    "target_end": 100,       // profundidad esperada
    "target_end_message": "Bajá un poco más...",
    "target_start": 165,     // extensión esperada arriba
    "min_eccentric_ms": 800, // bajada controlada
    "eccentric_phase": "to_end",
    "starts_at_end": false   // true para peso muerto desde el piso
  },
  "checks": [
    {
      "id": "torso_lean",
      "label": "Inclinación del torso",
      "message": "Pecho arriba: no te inclines tanto hacia adelante",
      "metric": { "kind": "inclination", "a": "hip", "b": "shoulder" },
      "max": 55,
      "phase": "end",        // any | start | moving | end
      "severity": "warning", // info | warning | error
      "hold_ms": 250
    }
  ]
}
```

### Puntos

`nose, ear, shoulder, elbow, wrist, hip, knee, ankle, heel, foot` (punta del pie).
Sin prefijo = lado elegido; `left_` / `right_` = lado del alumno; `mid_` = punto medio.

### Métricas

| kind | Qué mide | Uso típico |
|---|---|---|
| `angle` a,b,c | ángulo interno en b (0-180°) | rodilla, cadera, codo |
| `inclination` a,b | inclinación del segmento a→b desde la vertical hacia arriba | torso (cadera→hombro) |
| `ratio` a,b,c,d | dist(a,b) / dist(c,d) | rodillas hacia adentro (vista frontal) |
| `offset_x` a,b,c,d | (x_a − x_b) / dist(c,d); `facing` lo orienta hacia donde mira | barra lejos de las piernas |
| `offset_y` a,b,c,d | (y_b − y_a) / dist(c,d), positivo si a está arriba | talones levantados, altura de manos |
| `line_offset` a,b,c | distancia con signo de b a la recta a→c | cadera caída en plancha/flexiones |

### Conteo

Si la métrica baja durante el movimiento, `start > end` (sentadilla); si sube, `start < end` (press, hip thrust). Una repetición es un ciclo casa → afuera → casa con duración mínima `min_rep_ms`. Si se mueve más del 40% del recorrido pero no cruza `end`, es **parcial** (se avisa y no cuenta).

### Puntaje

100 − penalidades por repetición (error 30, warning 15, info 5). El puntaje de la serie es el promedio.

## Cómo agregar un ejercicio curado

1. Pensá **desde dónde se filma** y cuál es la métrica principal más estable.
2. Agregá el `RuleSet` en `src/lib/pose/library/index.ts` y sus alias en castellano en `ALIASES` (gana el alias más largo contenido en el nombre).
3. Agregá un test en `tests/pose.test.ts`: que cuente bien y que detecte al menos un error.
4. Si el ejercicio está en el seed, poné su `rule_key` en `scripts/generate-seed.py` y regenerá.
5. Probalo con la cámara en un celular real (de costado y de frente) antes de darlo por bueno.

La skill de Claude Code `.claude/skills/nuevo-ejercicio-tecnica` automatiza estos pasos.

## Calibración con videos reales (pendiente, ver roadmap)

Los umbrales actuales salen de biomecánica general. Para ajustarlos al gimnasio:

1. Grabar (con consentimiento) 5-10 series por ejercicio, bien hechas y con errores típicos, de costado y de frente.
2. Pasarlas por el motor en modo "registro" guardando la serie temporal de cada métrica (herramienta a construir: `/coach/calibrar`).
3. Elegir umbrales que separen bien/mal con pocos falsos positivos y actualizar la biblioteca.
4. Agregar esas series como fixtures de tests.

## Más adelante: modelos entrenados

Con suficientes videos etiquetados del propio gimnasio se puede entrenar un clasificador liviano sobre los landmarks (por ejemplo, un MLP o una red temporal pequeña exportada a TensorFlow.js/ONNX) para errores difíciles de expresar con reglas. Los datasets públicos (QEVD, FLEX, Fitness-AQA, M3GYM) sirven para investigar, pero la mayoría prohíbe uso comercial: revisar la licencia antes de usarlos para entrenar.
