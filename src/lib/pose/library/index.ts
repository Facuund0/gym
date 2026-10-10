import { parseRuleSet, type RuleSet, type RuleSetInput } from "../schema";

/*
  BIBLIOTECA CURADA DE REGLAS DE TÉCNICA
  ======================================
  Umbrales iniciales basados en biomecánica general. NO son verdad absoluta:
  hay que calibrarlos con videos reales de alumnos del gimnasio (ver
  docs/motor-de-tecnica.md → "Calibración"). Cada número está pensado para
  ser tolerante: es preferible no avisar que molestar con falsos positivos.

  Limitaciones conocidas de MediaPipe Pose (33 puntos):
  - No tiene puntos sobre la columna: no puede medir de verdad si se redondea
    la espalda baja. Usamos aproximaciones (cuello, línea hombro-cadera).
  - En 2D, lo que no está en el plano de la cámara se deforma: por eso cada
    ejercicio indica desde dónde filmar (setup_hint).
  - Evitamos consignas "mito" (ej. "la rodilla no pase la punta del pie"):
    la evidencia actual no lo respalda como error en sí mismo.
*/

const RULES: RuleSetInput[] = [
  {
    version: 1,
    key: "squat",
    name: "Sentadilla (vista lateral)",
    view: "side",
    mode: "reps",
    setup_hint: "Apoyá el teléfono de costado, a 2-3 metros, a la altura de la cadera. Que se vea de la cabeza a los pies.",
    required: ["shoulder", "hip", "knee", "ankle"],
    rep: {
      metric: { kind: "angle", a: "hip", b: "knee", c: "ankle" },
      start: 160,
      end: 120,
      target_end: 100,
      target_end_message: "Bajá un poco más: buscá la cadera a la altura de las rodillas",
      target_start: 165,
      target_start_message: "Arriba terminá de extender, parate derecho",
      min_eccentric_ms: 800,
      tempo_message: "Bajá más lento y controlado",
    },
    checks: [
      {
        id: "torso_lean",
        label: "Inclinación del torso",
        message: "Pecho arriba: no te inclines tanto hacia adelante",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        max: 55,
        phase: "end",
        severity: "warning",
        hold_ms: 250,
      },
      {
        id: "heel_lift",
        label: "Talones",
        message: "Apoyá todo el pie: que no se levanten los talones",
        metric: { kind: "offset_y", a: "heel", b: "foot", c: "knee", d: "ankle" },
        max: 0.12,
        phase: "any",
        severity: "warning",
        hold_ms: 400,
      },
    ],
  },
  {
    version: 1,
    key: "squat_front",
    name: "Sentadilla (vista frontal: rodillas)",
    view: "front",
    mode: "reps",
    setup_hint: "Teléfono de frente, a 2-3 metros, a la altura de la cadera. Esta vista sirve para ver si las rodillas se van hacia adentro.",
    required: ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"],
    rep: {
      metric: { kind: "offset_y", a: "mid_hip", b: "mid_knee", c: "mid_knee", d: "mid_ankle" },
      start: 0.75,
      end: 0.4,
      target_end: 0.25,
      target_end_message: "Bajá más: la cadera a la altura de las rodillas",
    },
    checks: [
      {
        id: "knee_valgus",
        label: "Rodillas hacia adentro",
        message: "Empujá las rodillas hacia afuera, en línea con los pies",
        metric: { kind: "ratio", a: "left_knee", b: "right_knee", c: "left_ankle", d: "right_ankle" },
        min: 0.85,
        phase: "any",
        severity: "error",
        hold_ms: 250,
      },
      {
        id: "hip_shift",
        label: "Cadera corrida",
        message: "Repartí el peso en las dos piernas",
        metric: { kind: "offset_x", a: "mid_hip", b: "mid_ankle", c: "left_hip", d: "right_hip" },
        min: -0.35,
        max: 0.35,
        phase: "any",
        severity: "warning",
        hold_ms: 400,
      },
    ],
  },
  {
    version: 1,
    key: "hinge",
    name: "Bisagra de cadera (peso muerto rumano)",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado a 2-3 metros, a la altura de la cadera. Que se vea todo el cuerpo y la barra.",
    required: ["shoulder", "hip", "knee", "ankle", "wrist"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "hip", c: "knee" },
      start: 155,
      end: 125,
      target_end: 110,
      target_end_message: "Llevá la cadera más atrás para bajar un poco más, sin redondear",
      target_start: 165,
      target_start_message: "Arriba terminá de extender la cadera, apretá glúteos",
      min_eccentric_ms: 900,
      tempo_message: "Bajá más lento, sentí el estiramiento atrás de las piernas",
    },
    checks: [
      {
        id: "knee_bend",
        label: "Flexión de rodillas",
        message: "Rodillas apenas flexionadas: es una bisagra, no una sentadilla",
        metric: { kind: "angle", a: "hip", b: "knee", c: "ankle" },
        min: 130,
        phase: "any",
        severity: "warning",
        hold_ms: 350,
      },
      {
        id: "bar_path",
        label: "Barra lejos del cuerpo",
        message: "Llevá la barra pegada a las piernas",
        metric: { kind: "offset_x", a: "wrist", b: "ankle", c: "knee", d: "ankle", facing: true },
        max: 0.6,
        phase: "any",
        severity: "warning",
        hold_ms: 350,
      },
      {
        id: "neck",
        label: "Cuello",
        message: "Cuello neutro: mirá al piso un metro adelante",
        metric: { kind: "angle", a: "ear", b: "shoulder", c: "hip" },
        min: 135,
        phase: "end",
        severity: "info",
        hold_ms: 400,
      },
    ],
  },
  {
    version: 1,
    key: "deadlift",
    name: "Peso muerto desde el piso",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado a 2-3 metros, a la altura de la cadera. Que se vean los pies y la barra.",
    required: ["shoulder", "hip", "knee", "ankle", "wrist"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "hip", c: "knee" },
      start: 160,
      end: 120,
      starts_at_end: true,
      target_start: 168,
      target_start_message: "Bloqueá arriba: cadera y rodillas extendidas",
      eccentric_phase: "to_end",
    },
    checks: [
      {
        id: "bar_path",
        label: "Barra lejos del cuerpo",
        message: "Barra pegada a las piernas todo el recorrido",
        metric: { kind: "offset_x", a: "wrist", b: "ankle", c: "knee", d: "ankle", facing: true },
        max: 0.5,
        phase: "any",
        severity: "warning",
        hold_ms: 300,
      },
      {
        id: "neck",
        label: "Cuello",
        message: "Cuello neutro, no levantes la cabeza",
        metric: { kind: "angle", a: "ear", b: "shoulder", c: "hip" },
        min: 135,
        phase: "any",
        severity: "info",
        hold_ms: 400,
      },
    ],
  },
  {
    version: 1,
    key: "pushup",
    name: "Flexiones de brazos",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono en el piso, de costado, a 1,5-2 metros. Que se vea de la cabeza a los pies.",
    required: ["shoulder", "elbow", "wrist", "hip", "ankle"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" },
      start: 150,
      end: 110,
      target_end: 95,
      target_end_message: "Bajá el pecho más cerca del piso",
      target_start: 160,
      target_start_message: "Extendé los brazos arriba",
      min_eccentric_ms: 600,
      tempo_message: "Bajá más controlado",
    },
    checks: [
      {
        id: "hip_sag",
        label: "Cadera caída",
        message: "Apretá abdomen y glúteos: se te cae la cadera",
        metric: { kind: "line_offset", a: "shoulder", b: "hip", c: "ankle" },
        min: -0.05,
        phase: "any",
        severity: "error",
        hold_ms: 400,
      },
      {
        id: "hip_pike",
        label: "Cadera alta",
        message: "Bajá la cadera: cuerpo en línea recta",
        metric: { kind: "line_offset", a: "shoulder", b: "hip", c: "ankle" },
        max: 0.09,
        phase: "any",
        severity: "warning",
        hold_ms: 400,
      },
      {
        id: "head",
        label: "Cabeza",
        message: "Cabeza alineada con el cuerpo, mirá al piso",
        metric: { kind: "angle", a: "ear", b: "shoulder", c: "hip" },
        min: 145,
        phase: "any",
        severity: "info",
        hold_ms: 500,
      },
    ],
  },
  {
    version: 1,
    key: "lunge",
    name: "Estocada / sentadilla búlgara",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado a 2-3 metros. Que se vean las dos piernas completas.",
    required: ["shoulder", "hip", "knee", "ankle"],
    rep: {
      metric: { kind: "angle", a: "hip", b: "knee", c: "ankle" },
      start: 155,
      end: 120,
      target_end: 100,
      target_end_message: "Bajá más: la rodilla de atrás cerca del piso",
      target_start: 160,
      min_eccentric_ms: 700,
      tempo_message: "Bajá controlado",
    },
    checks: [
      {
        id: "torso_lean",
        label: "Torso",
        message: "Torso erguido, no te vayas hacia adelante",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        max: 30,
        phase: "any",
        severity: "warning",
        hold_ms: 400,
      },
    ],
  },
  {
    version: 1,
    key: "overhead_press",
    name: "Press de hombros / press militar",
    view: "either",
    mode: "reps",
    setup_hint: "Teléfono de costado (ideal) o de frente, a 2 metros. Que se vea de las rodillas a las manos arriba.",
    required: ["shoulder", "elbow", "wrist", "hip"],
    rep: {
      metric: { kind: "offset_y", a: "wrist", b: "shoulder", c: "shoulder", d: "hip" },
      start: 0.25,
      end: 0.7,
      target_end: 0.85,
      target_end_message: "Extendé completo los brazos arriba",
      eccentric_phase: "to_start",
      min_eccentric_ms: 700,
      tempo_message: "Bajá el peso controlado",
    },
    checks: [
      {
        id: "lean_back",
        label: "Espalda arqueada",
        message: "No arquees la espalda: apretá glúteos y abdomen",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        max: 15,
        phase: "any",
        severity: "warning",
        hold_ms: 350,
      },
    ],
  },
  {
    version: 1,
    key: "biceps_curl",
    name: "Curl de bíceps",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado a 2 metros, a la altura del pecho. Que se vea de la cadera a la cabeza.",
    required: ["shoulder", "elbow", "wrist", "hip"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" },
      start: 145,
      end: 75,
      target_end: 55,
      target_end_message: "Subí completo, hasta arriba",
      target_start: 155,
      target_start_message: "Extendé el brazo completo abajo",
      eccentric_phase: "to_start",
      min_eccentric_ms: 800,
      tempo_message: "Bajá lento, sin soltar el peso",
    },
    checks: [
      {
        id: "swing",
        label: "Balanceo",
        message: "No balancees el cuerpo, que trabaje el brazo",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        max_range: 12,
        phase: "any",
        severity: "warning",
        hold_ms: 0,
      },
      {
        id: "elbow_drift",
        label: "Codo adelantado",
        message: "Codos pegados al cuerpo, que no se adelanten",
        metric: { kind: "inclination", a: "shoulder", b: "elbow" },
        min: 150,
        phase: "any",
        severity: "warning",
        hold_ms: 300,
      },
    ],
  },
  {
    version: 1,
    key: "lateral_raise",
    name: "Elevaciones laterales",
    view: "front",
    mode: "reps",
    setup_hint: "Teléfono de frente a 2 metros, a la altura del pecho.",
    required: ["shoulder", "elbow", "wrist", "hip"],
    rep: {
      metric: { kind: "angle", a: "hip", b: "shoulder", c: "elbow" },
      start: 35,
      end: 70,
      target_end: 80,
      target_end_message: "Subí hasta la altura de los hombros",
      eccentric_phase: "to_start",
      min_eccentric_ms: 800,
      tempo_message: "Bajá lento",
    },
    checks: [
      {
        id: "too_high",
        label: "Muy arriba",
        message: "No hace falta subir más que los hombros",
        metric: { kind: "angle", a: "hip", b: "shoulder", c: "elbow" },
        max: 110,
        phase: "any",
        severity: "info",
        hold_ms: 300,
      },
      {
        id: "elbow_bend",
        label: "Codos",
        message: "Brazos casi extendidos, codo apenas flexionado",
        metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" },
        min: 135,
        phase: "end",
        severity: "info",
        hold_ms: 300,
      },
      {
        id: "swing",
        label: "Impulso",
        message: "Sin impulso: el torso quieto",
        metric: { kind: "inclination", a: "mid_hip", b: "mid_shoulder" },
        max_range: 10,
        phase: "any",
        severity: "warning",
        hold_ms: 0,
      },
    ],
  },
  {
    version: 1,
    key: "plank",
    name: "Plancha",
    view: "side",
    mode: "hold",
    setup_hint: "Teléfono en el piso de costado, a 1,5-2 metros. Que se vea de la cabeza a los pies.",
    required: ["shoulder", "elbow", "hip", "ankle"],
    checks: [
      {
        id: "hip_sag",
        label: "Cadera caída",
        message: "Subí un poco la cadera: apretá abdomen y glúteos",
        metric: { kind: "line_offset", a: "shoulder", b: "hip", c: "ankle" },
        min: -0.05,
        phase: "any",
        severity: "error",
        hold_ms: 500,
      },
      {
        id: "hip_pike",
        label: "Cadera alta",
        message: "Bajá la cadera: cuerpo en línea recta",
        metric: { kind: "line_offset", a: "shoulder", b: "hip", c: "ankle" },
        max: 0.09,
        phase: "any",
        severity: "warning",
        hold_ms: 500,
      },
      {
        id: "head",
        label: "Cabeza",
        message: "Cabeza alineada, mirá al piso",
        metric: { kind: "angle", a: "ear", b: "shoulder", c: "hip" },
        min: 145,
        phase: "any",
        severity: "info",
        hold_ms: 600,
      },
    ],
  },
  {
    version: 1,
    key: "hip_thrust",
    name: "Hip thrust / puente de glúteos",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado, en el piso o un banco bajo, a 1,5-2 metros.",
    required: ["shoulder", "hip", "knee", "ankle"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "hip", c: "knee" },
      start: 140,
      end: 162,
      target_end: 170,
      target_end_message: "Extendé completo la cadera arriba y apretá glúteos",
      eccentric_phase: "to_start",
    },
    checks: [
      {
        id: "shin_angle",
        label: "Posición de pies",
        message: "Acomodá los pies: rodillas a 90 grados arriba",
        metric: { kind: "angle", a: "hip", b: "knee", c: "ankle" },
        min: 70,
        max: 115,
        phase: "end",
        severity: "info",
        hold_ms: 300,
      },
    ],
  },
  {
    version: 1,
    key: "row",
    name: "Remo inclinado",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado a 2 metros, a la altura de la cadera.",
    required: ["shoulder", "elbow", "wrist", "hip"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" },
      start: 145,
      end: 100,
      target_end: 85,
      target_end_message: "Llevá los codos más atrás, tirá hacia la panza",
      eccentric_phase: "to_start",
      min_eccentric_ms: 700,
      tempo_message: "Volvé controlando el peso",
    },
    checks: [
      {
        id: "torso_upright",
        label: "Torso muy vertical",
        message: "Inclinate más hacia adelante, con la espalda firme",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        min: 30,
        phase: "any",
        severity: "warning",
        hold_ms: 500,
      },
      {
        id: "swing",
        label: "Impulso con el torso",
        message: "Sin impulso: el torso quieto",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        max_range: 15,
        phase: "any",
        severity: "warning",
        hold_ms: 0,
      },
    ],
  },
  {
    version: 1,
    key: "pullup",
    name: "Dominadas",
    view: "either",
    mode: "reps",
    setup_hint: "Teléfono de frente o de espaldas a 2-3 metros, que se vea la barra y la cadera.",
    required: ["shoulder", "elbow", "wrist", "hip"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" },
      start: 145,
      end: 95,
      target_end: 75,
      target_end_message: "Subí hasta pasar el mentón por arriba de la barra",
      target_start: 155,
      target_start_message: "Bajá hasta extender los brazos",
      eccentric_phase: "to_start",
      min_eccentric_ms: 700,
      tempo_message: "Bajá controlado, sin dejarte caer",
    },
    checks: [],
  },
  {
    version: 1,
    key: "dips",
    name: "Fondos",
    view: "side",
    mode: "reps",
    setup_hint: "Teléfono de costado a 2 metros, a la altura del pecho.",
    required: ["shoulder", "elbow", "wrist", "hip"],
    rep: {
      metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" },
      start: 150,
      end: 110,
      target_end: 95,
      target_end_message: "Bajá hasta que el codo llegue a 90 grados",
      target_start: 160,
      min_eccentric_ms: 700,
      tempo_message: "Bajá controlado",
    },
    checks: [
      {
        id: "torso_lean",
        label: "Inclinación",
        message: "No te inclines tanto hacia adelante",
        metric: { kind: "inclination", a: "hip", b: "shoulder" },
        max: 40,
        phase: "any",
        severity: "info",
        hold_ms: 400,
      },
    ],
  },
];

export const CURATED_RULES: Record<string, RuleSet> = Object.fromEntries(
  RULES.map((r) => {
    const parsed = parseRuleSet(r);
    return [parsed.key, parsed];
  }),
);

/**
 * Nombres (normalizados, sin tildes) que mapean a cada set de reglas.
 * Gana el alias MÁS LARGO contenido en el nombre (así "sentadilla búlgara"
 * va a lunge y no a squat).
 */
const ALIASES: Record<string, string[]> = {
  squat: [
    "sentadilla", "squat", "sentadilla trasera", "back squat", "sentadilla frontal", "front squat",
    "sentadilla goblet", "goblet", "sentadilla copa", "sentadilla con barra", "sentadilla libre",
    "sentadilla smith", "sentadilla al cajon", "box squat", "sentadilla sumo", "sentadilla con mancuerna",
  ],
  squat_front: ["sentadilla vista frontal", "sentadilla de frente rodillas"],
  hinge: [
    "peso muerto rumano", "rdl", "romanian deadlift", "peso muerto piernas rigidas", "stiff",
    "buenos dias", "good morning", "bisagra", "peso muerto a una pierna", "peso muerto con mancuernas",
  ],
  deadlift: ["peso muerto", "deadlift", "peso muerto convencional", "peso muerto sumo", "sumo deadlift", "trap bar"],
  pushup: ["flexiones", "flexion de brazos", "lagartijas", "push up", "pushup", "push-up", "plancha con flexion"],
  lunge: [
    "estocada", "estocadas", "zancada", "zancadas", "lunge", "sentadilla bulgara", "bulgara",
    "split squat", "estocada inversa", "estocada caminando", "step up", "subida al cajon",
  ],
  overhead_press: [
    "press militar", "press de hombros", "press hombro", "overhead press", "press arnold",
    "press con mancuernas sentado", "push press", "press por encima de la cabeza",
  ],
  biceps_curl: ["curl", "curl de biceps", "biceps", "curl martillo", "curl con barra", "curl alternado", "curl predicador"],
  lateral_raise: ["elevaciones laterales", "elevacion lateral", "vuelos laterales", "lateral raise", "laterales"],
  plank: ["plancha", "plank", "plancha abdominal", "plancha frontal"],
  hip_thrust: ["hip thrust", "puente de gluteos", "puente gluteo", "glute bridge", "empuje de cadera"],
  row: [
    "remo", "remo inclinado", "remo con barra", "remo con mancuerna", "bent over row", "remo pendlay",
    "remo serrucho", "row",
  ],
  pullup: ["dominadas", "dominada", "pull up", "pullup", "chin up", "dominadas supinas", "dominadas asistidas"],
  dips: ["fondos", "fondos en paralelas", "dips", "fondos en banco"],
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Busca un set de reglas curado por nombre de ejercicio. */
export function findRuleKeyByName(name: string): string | null {
  const n = ` ${normalizeName(name)} `;
  let best: { key: string; len: number } | null = null;
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const a = ` ${normalizeName(alias)} `;
      if (n.includes(a) && (!best || a.length > best.len)) best = { key, len: a.length };
    }
  }
  return best?.key ?? null;
}

export function getCuratedRules(key: string | null | undefined): RuleSet | null {
  return key ? CURATED_RULES[key] ?? null : null;
}

export const CURATED_KEYS = Object.keys(CURATED_RULES);
