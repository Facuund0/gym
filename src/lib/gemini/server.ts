import "server-only";
import { GoogleGenAI } from "@google/genai";
import { CURATED_RULES } from "@/lib/pose/library";
import { ruleSetJsonSchema, safeParseRuleSet, type RuleSet } from "@/lib/pose/schema";

/*
  Gemini se usa SOLO para dos cosas, nunca en el bucle de tiempo real:
  1. Generar reglas de técnica (JSON) para ejercicios que no están en la biblioteca curada.
     Se generan una vez, se validan con zod y se guardan en la base (caché para todos).
  2. (Opcional, con consentimiento) una devolución escrita al terminar una serie, a partir
     de 3-4 fotogramas clave + el resumen numérico del motor.

  Por qué no en tiempo real: la investigación (QEVD, Qualcomm 2024) muestra que los modelos
  de visión-lenguaje dan feedback genérico y a destiempo en coaching en vivo; además la cuota
  gratuita no alcanza para analizar video continuo.

  Ojo con el plan gratuito: Google puede usar el contenido para mejorar sus productos.
  Por eso NO se mandan imágenes salvo que el alumno lo acepte explícitamente.
*/

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

function isRetryable(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err);
  return /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|500|overloaded/i.test(msg);
}

async function generateJson(prompt: string, schema: unknown): Promise<string> {
  const ai = client();
  let lastErr: unknown;
  for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0.2,
        },
      });
      const text = res.text;
      if (text) return text;
      lastErr = new Error("Respuesta vacía de Gemini");
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const RULES_SYSTEM = `Sos un entrenador de fuerza con formación en biomecánica. Tu tarea es escribir REGLAS
DE DETECCIÓN DE TÉCNICA para un sistema que analiza video con MediaPipe Pose (33 puntos 2D por cuadro).

Puntos disponibles: nose, ear, shoulder, elbow, wrist, hip, knee, ankle, heel, foot (punta del pie).
Sin prefijo = lado más visible a la cámara. Prefijos: left_, right_ (lado del alumno) y mid_ (punto medio).
NO hay puntos sobre la columna, así que no inventes chequeos de "espalda redondeada".

Métricas (todas en la imagen, ángulos en grados):
- angle: ángulo interno en b formado por a-b-c (0-180). Ej. rodilla = angle(hip, knee, ankle), 180 = extendida.
- inclination: inclinación del segmento a→b respecto de la vertical hacia arriba. 0 = b justo encima de a, 90 = horizontal, 180 = b debajo.
- ratio: distancia(a,b) / distancia(c,d).
- offset_x: (x_a - x_b) / distancia(c,d). Con facing=true, positivo = hacia donde mira el alumno.
- offset_y: (y_b - y_a) / distancia(c,d). Positivo = a está más arriba que b.
- line_offset: distancia con signo de b a la recta a→c dividida |ac|. Positivo = b por encima de la recta.

Conteo de repeticiones (rep): start = umbral de la posición inicial, end = umbral que hay que cruzar
para que cuente. Si la métrica baja al hacer el movimiento, start > end; si sube, start < end.
target_end / target_start son valores más exigentes (profundidad o extensión completa) y sus mensajes.
eccentric_phase: "to_end" si la bajada controlada va hacia end (sentadilla, flexión), "to_start" si va hacia start (curl, press, remo).
starts_at_end: true solo si el ejercicio arranca en la posición "end" (ej. peso muerto desde el piso).
Para isométricos usá mode "hold" y omití rep.

Chequeos (checks): máximo 4, solo errores frecuentes y detectables con esos puntos. phase: any, start, moving o end.
Usá max_range para "sin balanceo" (rango de la métrica dentro de la repetición).
Umbrales TOLERANTES: mejor no avisar que dar falsos positivos. No uses mitos (ej. "la rodilla no pase la punta del pie").

Mensajes: español rioplatense (vos), imperativo, cortos (máx. 70 caracteres), que se puedan leer en voz alta.
setup_hint: dónde poner el teléfono (de costado o de frente, distancia, altura).
view: "side" si el movimiento es en el plano sagital, "front" si es frontal, "either" si da igual.
key: snake_case sin tildes. required: 3 a 6 puntos imprescindibles.`;

export async function generateRulesForExercise(name: string, description?: string | null): Promise<RuleSet> {
  const examples = JSON.stringify([CURATED_RULES.squat, CURATED_RULES.biceps_curl, CURATED_RULES.plank]);
  const base = `${RULES_SYSTEM}

Ejemplos válidos (formato exacto):
${examples}

Ejercicio: "${name}"${description ? `\nDescripción del entrenador: ${description}` : ""}

Devolvé SOLO el JSON del set de reglas para este ejercicio.`;

  let prompt = base;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await generateJson(prompt, ruleSetJsonSchema);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      prompt = `${base}\n\nTu respuesta anterior no era JSON válido. Corregilo.`;
      continue;
    }
    const parsed = safeParseRuleSet(json);
    if (parsed.success) return parsed.data;
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    prompt = `${base}\n\nTu respuesta anterior tenía estos errores, corregilos: ${issues}\nRespuesta anterior: ${text}`;
  }
  throw new Error("Gemini no devolvió reglas válidas para este ejercicio");
}

export interface ReviewInput {
  exerciseName: string;
  summary: { reps: number; score: number | null; issues: Array<{ label: string; count: number }> };
  /** JPEG en base64 (sin el prefijo data:). Máximo 4. */
  frames: string[];
}

export async function reviewKeyframes(input: ReviewInput): Promise<string> {
  const ai = client();
  const parts = [
    {
      text: `Sos entrenador personal. Te paso ${input.frames.length} fotogramas de una serie de "${input.exerciseName}"
(inicio, punto de giro y final) y el resumen del detector automático:
${JSON.stringify(input.summary)}
Dame una devolución en español rioplatense, en 3 viñetas cortas como máximo: qué estuvo bien y
la corrección más importante. Si las imágenes no permiten juzgar algo, decilo. No des consejos médicos.`,
    },
    ...input.frames.slice(0, 4).map((data) => ({ inlineData: { mimeType: "image/jpeg", data } })),
  ];
  let lastErr: unknown;
  for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { temperature: 0.4, maxOutputTokens: 400 },
      });
      if (res.text) return res.text.trim();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("No se pudo obtener la devolución");
}
