import JSZip from "jszip";
import { setCells, type CellValue } from "./xlsxCells";

/*
  Exporta un programa a la "Planilla Gualda" original (public/templates/planilla.xlsx).

  Mapa de la planilla (relevado del archivo original):
  - Hojas "Semana 1".."Semana 12". OJO: "Semana 1" tiene una fila extra (Objetivo, fila 4),
    así que sus bloques empiezan una fila más abajo que en las semanas 2-12.
      Semana 1:    ejercicios día d en filas 8+12(d-1) .. 15+12(d-1); resumen en 16+12(d-1)
      Semanas 2-12: ejercicios día d en filas 7+12(d-1) .. 14+12(d-1); resumen en 15+12(d-1)
  - Columnas de cada ejercicio: B notas alumno · C categoría · D ejercicio · E feedback técnico
    · F series · G RIR/RPE · H descanso · I/J K/L M/N O/P Q/R = reps/kg series 1..5 · S tonelaje (fórmula)
  - Fila de resumen: C duración · E DOMS (1-10) · H grupo muscular · O pesaje (número) · S esfuerzo ("RPE 8")
  - Encabezado Semana 1: D2 entrenador · D3 alumno · D4 objetivo · I3 fecha de inicio
  - "Feedback del alumno y pesaje": filas 7-19, columnas C..N = semanas 1..12
  - "Contador de series": SUMIF por categoría. La original tenía 2 errores que corregimos al exportar:
      D8 tenía un 9 fijo en vez de la fórmula, y la fila 23 (Espalda) de las semanas 2-12
      sumaba siempre la Semana 1.
*/

export const PLANILLA_LIMITS = { weeks: 12, days: 6, exercisesPerDay: 8, sets: 5 } as const;

export interface PlanillaExercise {
  week: number;
  day: number;
  position: number;
  name: string;
  category?: string | null;
  sets?: number | null;
  rir_rpe?: string | null;
  rest?: string | null;
  target_reps?: string | null;
  coach_feedback?: string | null;
  student_note?: string | null;
  logged?: Array<{ reps?: number | null; kg?: number | null }>;
}

export interface PlanillaSession {
  week: number;
  day: number;
  duration_min?: number | null;
  doms?: number | null;
  muscle_group?: string | null;
  weigh_in_kg?: number | null;
  effort_rpe?: number | null;
}

export interface PlanillaFeedback {
  week: number;
  motivation?: number | null;
  perceived_effort?: number | null;
  most_stimulated?: string | null;
  best_recovered?: string | null;
  favorite_exercises?: string | null;
  disliked_exercises?: string | null;
  stress?: number | null;
  sleep_hours?: number | null;
  sleep_quality?: number | null;
  foods_bad?: string | null;
  satiety?: number | null;
  hungry_meals?: string | null;
  full_meals?: string | null;
}

export interface PlanillaData {
  coachName?: string | null;
  studentName: string;
  goal?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  weeks: number;
  exercises: PlanillaExercise[];
  sessions?: PlanillaSession[];
  feedback?: PlanillaFeedback[];
}

const SET_COLS: Array<[string, string]> = [
  ["I", "J"],
  ["K", "L"],
  ["M", "N"],
  ["O", "P"],
  ["Q", "R"],
];

const FEEDBACK_ROWS: Array<[keyof PlanillaFeedback, number]> = [
  ["motivation", 7],
  ["perceived_effort", 8],
  ["most_stimulated", 9],
  ["best_recovered", 10],
  ["favorite_exercises", 11],
  ["disliked_exercises", 12],
  ["stress", 13],
  ["sleep_hours", 14],
  ["sleep_quality", 15],
  ["foods_bad", 16],
  ["satiety", 17],
  ["hungry_meals", 18],
  ["full_meals", 19],
];

export function exerciseRow(week: number, day: number, position: number): number {
  const base = week === 1 ? 8 : 7;
  return base + 12 * (day - 1) + (position - 1);
}

export function summaryRow(week: number, day: number): number {
  const base = week === 1 ? 8 : 7;
  return base + 8 + 12 * (day - 1);
}

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function excelDateSerial(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

const clean = (v: string | null | undefined): CellValue => (v === null || v === undefined || v === "" ? undefined : v);
const num = (v: number | null | undefined): CellValue => (v === null || v === undefined || Number.isNaN(v) ? undefined : v);

async function sheetPaths(zip: JSZip): Promise<Map<string, string>> {
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) relMap.set(m[1], m[2]);
  // Algunos generadores ponen Target antes que Id
  for (const m of rels.matchAll(/<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) relMap.set(m[2], m[1]);
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const target = relMap.get(m[2]);
    if (target) out.set(decodeXml(m[1]), `xl/${target.replace(/^\/?xl\//, "")}`);
  }
  return out;
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

export interface FillResult {
  bytes: Uint8Array;
  warnings: string[];
}

export async function fillPlanilla(template: ArrayBuffer | Uint8Array, data: PlanillaData): Promise<FillResult> {
  const zip = await JSZip.loadAsync(template);
  const paths = await sheetPaths(zip);
  const warnings: string[] = [];
  const weeks = Math.min(PLANILLA_LIMITS.weeks, Math.max(1, data.weeks));

  // Agrupar celdas por hoja
  const bySheet = new Map<string, Record<string, CellValue>>();
  const put = (sheet: string, ref: string, v: CellValue) => {
    if (v === undefined) return;
    const m = bySheet.get(sheet) ?? {};
    m[ref] = v;
    bySheet.set(sheet, m);
  };

  // Encabezado (las semanas 2-12 lo toman de la Semana 1 por fórmula)
  put("Semana 1", "D2", clean(data.coachName));
  put("Semana 1", "D3", clean(data.studentName));
  put("Semana 1", "D4", clean(data.goal));
  if (data.startDate) put("Semana 1", "I3", num(excelDateSerial(data.startDate)));
  // La original da #VALUE! si la fecha de inicio es futura (DATEDIF con inicio > fin).
  put("Semana 1", "P3", { formula: 'IFERROR(INT(DATEDIF($I$3,$I$2,"D")/7),0)' });

  for (const ex of data.exercises) {
    if (ex.week > PLANILLA_LIMITS.weeks || ex.day > PLANILLA_LIMITS.days || ex.position > PLANILLA_LIMITS.exercisesPerDay) {
      warnings.push(`"${ex.name}" (semana ${ex.week}, día ${ex.day}, posición ${ex.position}) no entra en la planilla y se omitió.`);
      continue;
    }
    const sheet = `Semana ${ex.week}`;
    const r = exerciseRow(ex.week, ex.day, ex.position);
    const name = ex.target_reps ? `${ex.name} · ${ex.target_reps} reps` : ex.name;
    put(sheet, `B${r}`, clean(ex.student_note));
    put(sheet, `C${r}`, clean(ex.category));
    put(sheet, `D${r}`, clean(name));
    put(sheet, `E${r}`, clean(ex.coach_feedback));
    put(sheet, `F${r}`, num(ex.sets));
    put(sheet, `G${r}`, clean(ex.rir_rpe));
    put(sheet, `H${r}`, clean(ex.rest));
    (ex.logged ?? []).slice(0, PLANILLA_LIMITS.sets).forEach((s, i) => {
      const [rc, kc] = SET_COLS[i];
      put(sheet, `${rc}${r}`, num(s.reps));
      put(sheet, `${kc}${r}`, num(s.kg));
    });
    if ((ex.logged?.length ?? 0) > PLANILLA_LIMITS.sets) {
      warnings.push(`"${ex.name}" tiene más de 5 series registradas; se exportaron las primeras 5.`);
    }
  }

  for (const s of data.sessions ?? []) {
    if (s.week > PLANILLA_LIMITS.weeks || s.day > PLANILLA_LIMITS.days) continue;
    const sheet = `Semana ${s.week}`;
    const r = summaryRow(s.week, s.day);
    put(sheet, `C${r}`, s.duration_min ? `${s.duration_min} min` : undefined);
    put(sheet, `E${r}`, num(s.doms));
    put(sheet, `H${r}`, clean(s.muscle_group));
    put(sheet, `O${r}`, num(s.weigh_in_kg));
    put(sheet, `S${r}`, s.effort_rpe ? `RPE ${s.effort_rpe}` : undefined);
  }

  for (const f of data.feedback ?? []) {
    if (f.week < 1 || f.week > PLANILLA_LIMITS.weeks) continue;
    const col = colLetter(2 + f.week); // semana 1 → C
    for (const [key, row] of FEEDBACK_ROWS) {
      const v = f[key];
      put("Feedback del alumno y pesaje", `${col}${row}`, typeof v === "number" ? num(v) : clean(v as string | null));
    }
  }

  // Corrección de las fórmulas rotas del "Contador de series"
  for (let w = 1; w <= PLANILLA_LIMITS.weeks; w++) {
    const col = colLetter(4 + 2 * (w - 1));
    for (let r = 6; r <= 25; r++) {
      put("Contador de series", `${col}${r}`, {
        formula: `SUMIF('Semana ${w}'!$C:$C,$C${r},'Semana ${w}'!$F:$F)`,
      });
    }
  }

  for (const [sheet, cells] of bySheet) {
    const path = paths.get(sheet);
    if (!path) {
      warnings.push(`No se encontró la hoja "${sheet}" en la plantilla.`);
      continue;
    }
    const xml = await zip.file(path)!.async("string");
    zip.file(path, setCells(xml, cells));
  }

  // Mostrar solo las semanas que usa el programa y forzar el recálculo al abrir.
  let wbXml = await zip.file("xl/workbook.xml")!.async("string");
  wbXml = wbXml.replace(/<sheet\b[^>]*?\/>/g, (tag) => {
    const m = /name="Semana (\d+)"/.exec(tag);
    if (!m) return tag;
    const visible = Number(m[1]) <= weeks;
    const withoutState = tag.replace(/\s+state="[^"]*"/, "");
    return visible ? withoutState.replace("<sheet", '<sheet state="visible"') : withoutState.replace("<sheet", '<sheet state="hidden"');
  });
  if (/<calcPr\b[^>]*\/>/.test(wbXml)) {
    wbXml = wbXml.replace(/<calcPr\b[^>]*\/>/, '<calcPr fullCalcOnLoad="1"/>');
  } else {
    wbXml = wbXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
  }
  zip.file("xl/workbook.xml", wbXml);

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { bytes, warnings };
}

export function planillaFileName(studentName: string, title?: string | null): string {
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `Planilla-${slug(studentName) || "alumno"}${title ? `-${slug(title)}` : ""}.xlsx`;
}
