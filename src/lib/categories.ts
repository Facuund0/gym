// Las 20 categorías de la planilla (lista desplegable de "Categoría de ejercicio").
// Tienen que coincidir EXACTO con la tabla exercise_categories y con la planilla,
// porque el "Contador de series" suma series por categoría con SUMIF.
export const PATTERNS = [
  "Empuje horizontal",
  "Empuje vertical",
  "Tracción horizontal",
  "Tracción vertical",
  "Cambio de nivel rodilla",
  "Cambio de nivel cadera",
] as const;

export const MUSCLES = [
  "Gemelos",
  "Cuádriceps",
  "Isquiosurales",
  "Abductores",
  "Aductores",
  "Glúteo",
  "Abdominales",
  "Deltoides anterior",
  "Deltoides lateral",
  "Deltoides posterior",
  "Pectoral",
  "Espalda",
  "Bíceps",
  "Tríceps",
] as const;

export const CATEGORIES = [...PATTERNS, ...MUSCLES] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Los patrones también suman series indirectas a músculos (columna TOTAL de la
 * planilla). Ej.: "Cambio de nivel rodilla" suma a Cuádriceps y Glúteo.
 */
export const PATTERN_CONTRIBUTIONS: Record<string, Category[]> = {
  "Empuje horizontal": ["Deltoides anterior", "Pectoral", "Tríceps"],
  "Empuje vertical": ["Deltoides anterior", "Tríceps"],
  "Tracción horizontal": ["Deltoides posterior", "Espalda", "Bíceps"],
  "Tracción vertical": ["Deltoides posterior", "Espalda", "Bíceps"],
  "Cambio de nivel rodilla": ["Cuádriceps", "Glúteo"],
  "Cambio de nivel cadera": ["Isquiosurales", "Glúteo"],
};

/** Series totales por músculo (directas + indirectas), igual que la hoja "Contador de series". */
export function seriesByMuscle(items: Array<{ category: string | null; sets: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MUSCLES) out[m] = 0;
  for (const p of PATTERNS) out[p] = 0;
  for (const it of items) {
    if (!it.category) continue;
    out[it.category] = (out[it.category] ?? 0) + it.sets;
    for (const m of PATTERN_CONTRIBUTIONS[it.category] ?? []) out[m] += it.sets;
  }
  return out;
}
