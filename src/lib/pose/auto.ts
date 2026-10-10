import { evaluateMetric, type MetricContext } from "./metrics";
import { visibleSide, type Landmark } from "./landmarks";
import { parseRuleSet, type Metric, type RuleSet } from "./schema";

/*
  MODO AUTOMÁTICO (sin reglas)
  ============================
  Para ejercicios que no tienen reglas curadas ni generadas todavía (por
  ejemplo, sin conexión o con la cuota de Gemini agotada). Observa los
  primeros segundos de movimiento, elige la articulación que más se mueve y
  arma un contador de repeticiones adaptado al recorrido observado.
  NO corrige técnica: solo cuenta y avisa recorridos parciales.
*/

interface Candidate {
  id: string;
  label: string;
  metric: Metric;
}

const CANDIDATES: Candidate[] = [
  { id: "knee", label: "rodilla", metric: { kind: "angle", a: "hip", b: "knee", c: "ankle" } },
  { id: "hip", label: "cadera", metric: { kind: "angle", a: "shoulder", b: "hip", c: "knee" } },
  { id: "elbow", label: "codo", metric: { kind: "angle", a: "shoulder", b: "elbow", c: "wrist" } },
  { id: "shoulder", label: "hombro", metric: { kind: "angle", a: "hip", b: "shoulder", c: "elbow" } },
];

const REQUIRED_BY_CANDIDATE: Record<string, string[]> = {
  knee: ["hip", "knee", "ankle"],
  hip: ["shoulder", "hip", "knee"],
  elbow: ["shoulder", "elbow", "wrist"],
  shoulder: ["hip", "shoulder", "elbow"],
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

export class AutoCalibrator {
  private samples = new Map<string, number[]>();
  private firstValue = new Map<string, number>();
  private startT: number | null = null;

  constructor(private exerciseName: string, private windowMs = 6000, private minRangeDeg = 35) {}

  /** Devuelve un RuleSet cuando ya tiene suficiente información, o null mientras calibra. */
  add(landmarks: Landmark[] | undefined, tMs: number, aspect: number): RuleSet | null {
    if (!landmarks || landmarks.length < 33) return null;
    if (this.startT === null) this.startT = tMs;
    const side = visibleSide(landmarks, ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]);
    const ctx: MetricContext = { landmarks, side, aspect, facing: 1 };
    for (const c of CANDIDATES) {
      const mv = evaluateMetric(c.metric, ctx);
      if (!mv || mv.visibility < 0.5) continue;
      const arr = this.samples.get(c.id) ?? [];
      arr.push(mv.value);
      this.samples.set(c.id, arr);
      if (!this.firstValue.has(c.id)) this.firstValue.set(c.id, mv.value);
    }
    const elapsed = tMs - this.startT;
    const best = this.bestCandidate();
    // Esperamos a ver al menos ~2 repeticiones de amplitud suficiente o a que pase la ventana.
    if (best && (best.range >= this.minRangeDeg * 1.5 || (elapsed > this.windowMs && best.range >= this.minRangeDeg))) {
      return this.build(best.candidate, best.lo, best.hi);
    }
    return null;
  }

  progress(tMs: number): number {
    return this.startT === null ? 0 : Math.min(1, (tMs - this.startT) / this.windowMs);
  }

  private bestCandidate() {
    let best: { candidate: Candidate; range: number; lo: number; hi: number } | null = null;
    for (const c of CANDIDATES) {
      const arr = this.samples.get(c.id);
      if (!arr || arr.length < 20) continue;
      const sorted = [...arr].sort((a, b) => a - b);
      const lo = percentile(sorted, 0.05);
      const hi = percentile(sorted, 0.95);
      const range = hi - lo;
      if (!best || range > best.range) best = { candidate: c, range, lo, hi };
    }
    return best;
  }

  private build(c: Candidate, lo: number, hi: number): RuleSet {
    const first = this.firstValue.get(c.id) ?? hi;
    // Si arrancó más cerca del valor alto, la posición inicial es "alta" (ej. parado en sentadilla).
    const startsHigh = Math.abs(first - hi) <= Math.abs(first - lo);
    const range = hi - lo;
    const start = startsHigh ? hi - range * 0.25 : lo + range * 0.25;
    const end = startsHigh ? lo + range * 0.3 : hi - range * 0.3;
    return parseRuleSet({
      version: 1,
      key: `auto_${c.id}`,
      name: `${this.exerciseName} (modo automático)`,
      view: "either",
      mode: "reps",
      setup_hint: "Modo automático: hacé 2 repeticiones de prueba para que la app aprenda el movimiento.",
      required: REQUIRED_BY_CANDIDATE[c.id],
      rep: {
        metric: c.metric,
        start: Math.round(start),
        end: Math.round(end),
        target_end_message: `Completá el recorrido de la ${c.label}`,
      },
      checks: [],
      notes: `Calibrado automáticamente sobre la ${c.label} (rango observado ${Math.round(lo)}°–${Math.round(hi)}°).`,
    });
  }
}
