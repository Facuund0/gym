import { z } from "zod";
import { POINT_REF_PATTERN } from "./landmarks";

/*
  Formato de las REGLAS DE TÉCNICA de un ejercicio.
  - Es JSON plano (snake_case) para poder guardarlo en Postgres (exercises.pose_rules)
    y para que Gemini lo pueda generar con "structured output".
  - Las reglas curadas viven en src/lib/pose/library/*.ts con este mismo formato.

  Métricas disponibles (todas medidas en la imagen, corregidas por aspecto):
  - angle:       ángulo interno en b formado por a-b-c (0..180°)
  - inclination: inclinación del segmento a→b respecto de la vertical hacia arriba (0..180°)
  - ratio:       distancia(a,b) / distancia(c,d)
  - offset_x:    (x_a - x_b) / distancia(c,d). Con facing=true el signo se ajusta
                 para que positivo = hacia donde mira el alumno.
  - offset_y:    (y_b - y_a) / distancia(c,d). Positivo = a está más ARRIBA que b.
  - line_offset: distancia con signo de b a la recta a→c / |ac|. Positivo = b arriba de la recta.
*/

const pointRef = z.string().regex(POINT_REF_PATTERN, "Punto inválido");

export const metricSchema = z
  .object({
    kind: z.enum(["angle", "inclination", "ratio", "offset_x", "offset_y", "line_offset"]),
    a: pointRef,
    b: pointRef,
    c: pointRef.optional(),
    d: pointRef.optional(),
    facing: z.boolean().optional(),
  })
  .superRefine((m, ctx) => {
    const needC = m.kind === "angle" || m.kind === "line_offset" || m.kind === "ratio" || m.kind.startsWith("offset");
    const needD = m.kind === "ratio" || m.kind.startsWith("offset");
    if (needC && !m.c) ctx.addIssue({ code: "custom", message: `La métrica ${m.kind} necesita el punto c` });
    if (needD && !m.d) ctx.addIssue({ code: "custom", message: `La métrica ${m.kind} necesita el punto d` });
  });

export const PHASES = ["any", "start", "moving", "end"] as const;
export type CheckPhase = (typeof PHASES)[number];

export const checkSchema = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    /** Consigna corta, en voz imperativa y en español rioplatense. Se lee en voz alta. */
    message: z.string().min(1).max(90),
    metric: metricSchema,
    min: z.number().optional(),
    max: z.number().optional(),
    /** Rango máximo permitido de la métrica dentro de una repetición (ej. balanceo del torso). */
    max_range: z.number().positive().optional(),
    /** start = posición inicial, end = punto de giro (abajo en sentadilla), moving = en tránsito. */
    phase: z.enum(PHASES).default("any"),
    severity: z.enum(["info", "warning", "error"]).default("warning"),
    /** Tiempo mínimo que tiene que durar el error antes de marcarlo (evita falsos positivos). */
    hold_ms: z.number().int().min(0).max(3000).default(300),
  })
  .refine((c) => c.min !== undefined || c.max !== undefined || c.max_range !== undefined, {
    message: "Cada chequeo necesita min, max o max_range",
  });

export const repSchema = z
  .object({
    metric: metricSchema,
    /** Umbral que define la posición inicial (ej. rodilla > 160° = parado). */
    start: z.number(),
    /** Umbral que hay que cruzar para que cuente la repetición (ej. rodilla < 115°). */
    end: z.number(),
    /** Valor más exigente que se espera en el punto de giro (profundidad / extensión completa). */
    target_end: z.number().optional(),
    target_end_message: z.string().max(90).optional(),
    /** Valor más exigente esperado en la posición inicial (bloqueo / extensión arriba). */
    target_start: z.number().optional(),
    target_start_message: z.string().max(90).optional(),
    /** Duración mínima de la fase excéntrica para no marcar "controlá la bajada". */
    min_eccentric_ms: z.number().int().min(0).max(5000).optional(),
    tempo_message: z.string().max(90).optional(),
    /** Qué tramo es la bajada controlada: hacia "end" (sentadilla, flexión) o hacia "start" (press, curl, dominada). */
    eccentric_phase: z.enum(["to_end", "to_start"]).default("to_end"),
    /** Si true, la repetición arranca en la posición "end" (ej. peso muerto desde el piso). */
    starts_at_end: z.boolean().default(false),
    min_rep_ms: z.number().int().min(200).max(10000).default(600),
  })
  .refine((r) => r.start !== r.end, { message: "start y end no pueden ser iguales" })
  .refine(
    (r) => {
      const dec = r.start > r.end;
      const okEnd = r.target_end === undefined || (dec ? r.target_end <= r.end : r.target_end >= r.end);
      const okStart = r.target_start === undefined || (dec ? r.target_start >= r.start : r.target_start <= r.start);
      return okEnd && okStart;
    },
    { message: "target_end/target_start tienen que ser más exigentes que end/start" },
  );

export const ruleSetSchema = z
  .object({
    version: z.literal(1).default(1),
    key: z.string().min(1).max(60),
    name: z.string().min(1).max(80),
    view: z.enum(["side", "front", "either"]),
    side: z.enum(["auto", "left", "right"]).default("auto"),
    mode: z.enum(["reps", "hold"]).default("reps"),
    /** Indicación para ubicar el teléfono, se muestra antes de empezar. */
    setup_hint: z.string().max(160),
    /** Articulaciones que tienen que verse sí o sí para analizar. */
    required: z.array(pointRef).min(2).max(10),
    rep: repSchema.optional(),
    checks: z.array(checkSchema).max(10).default([]),
    notes: z.string().max(400).optional(),
  })
  .refine((r) => r.mode === "hold" || r.rep !== undefined, {
    message: "Los ejercicios por repeticiones necesitan la sección rep",
  });

export type Metric = z.infer<typeof metricSchema>;
export type Check = z.infer<typeof checkSchema>;
export type RepConfig = z.infer<typeof repSchema>;
export type RuleSet = z.infer<typeof ruleSetSchema>;
export type RuleSetInput = z.input<typeof ruleSetSchema>;

export function parseRuleSet(input: unknown): RuleSet {
  return ruleSetSchema.parse(input);
}

export function safeParseRuleSet(input: unknown) {
  return ruleSetSchema.safeParse(input);
}

/**
 * JSON Schema escrito a mano (subconjunto compatible con "structured output" de Gemini).
 * Se mantiene alineado con ruleSetSchema; la validación final siempre la hace zod.
 */
const POINT_ENUM: string[] = (() => {
  const joints = ["nose", "ear", "shoulder", "elbow", "wrist", "hip", "knee", "ankle", "heel", "foot"];
  const out: string[] = [];
  for (const j of joints) {
    out.push(j);
    if (j !== "nose") out.push(`left_${j}`, `right_${j}`, `mid_${j}`);
  }
  return out;
})();

const metricJson = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["angle", "inclination", "ratio", "offset_x", "offset_y", "line_offset"] },
    a: { type: "string", enum: POINT_ENUM },
    b: { type: "string", enum: POINT_ENUM },
    c: { type: "string", enum: POINT_ENUM },
    d: { type: "string", enum: POINT_ENUM },
    facing: { type: "boolean" },
  },
  required: ["kind", "a", "b"],
};

export const ruleSetJsonSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    key: { type: "string" },
    name: { type: "string" },
    view: { type: "string", enum: ["side", "front", "either"] },
    side: { type: "string", enum: ["auto", "left", "right"] },
    mode: { type: "string", enum: ["reps", "hold"] },
    setup_hint: { type: "string" },
    required: { type: "array", items: { type: "string", enum: POINT_ENUM } },
    rep: {
      type: "object",
      properties: {
        metric: metricJson,
        start: { type: "number" },
        end: { type: "number" },
        target_end: { type: "number" },
        target_end_message: { type: "string" },
        target_start: { type: "number" },
        target_start_message: { type: "string" },
        min_eccentric_ms: { type: "integer" },
        tempo_message: { type: "string" },
        eccentric_phase: { type: "string", enum: ["to_end", "to_start"] },
        starts_at_end: { type: "boolean" },
      },
      required: ["metric", "start", "end"],
    },
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          message: { type: "string" },
          metric: metricJson,
          min: { type: "number" },
          max: { type: "number" },
          max_range: { type: "number" },
          phase: { type: "string", enum: [...PHASES] },
          severity: { type: "string", enum: ["info", "warning", "error"] },
        },
        required: ["id", "label", "message", "metric", "phase", "severity"],
      },
    },
    notes: { type: "string" },
  },
  required: ["version", "key", "name", "view", "mode", "setup_hint", "required", "checks"],
} as const;
