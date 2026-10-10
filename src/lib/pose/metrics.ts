import { angleAt, distance, inclination, lineOffset } from "./geometry";
import { resolvePoint, type Landmark, type Point2, type Side } from "./landmarks";
import type { Metric } from "./schema";

export interface MetricContext {
  landmarks: Landmark[];
  side: Side;
  aspect: number;
  /** +1 si el alumno mira hacia la derecha de la imagen, -1 si mira a la izquierda. */
  facing: 1 | -1;
}

export interface MetricValue {
  value: number;
  /** Visibilidad mínima de los puntos usados (0..1). */
  visibility: number;
}

function pts(m: Metric, ctx: MetricContext): Array<Point2 | null> {
  const refs = [m.a, m.b, m.c, m.d].filter((r): r is string => Boolean(r));
  return refs.map((r) => resolvePoint(r, ctx.landmarks, ctx.side, ctx.aspect));
}

export function evaluateMetric(m: Metric, ctx: MetricContext): MetricValue | null {
  const p = pts(m, ctx);
  if (p.some((x) => x === null)) return null;
  const [a, b, c, d] = p as Point2[];
  const visibility = Math.min(...(p as Point2[]).map((x) => x.visibility));
  let value: number;
  switch (m.kind) {
    case "angle":
      value = angleAt(a, b, c);
      break;
    case "inclination":
      value = inclination(a, b);
      break;
    case "ratio": {
      const den = distance(c, d);
      value = den === 0 ? NaN : distance(a, b) / den;
      break;
    }
    case "offset_x": {
      const den = distance(c, d);
      const raw = den === 0 ? NaN : (a.x - b.x) / den;
      value = m.facing ? raw * ctx.facing : raw;
      break;
    }
    case "offset_y": {
      const den = distance(c, d);
      value = den === 0 ? NaN : (b.y - a.y) / den;
      break;
    }
    case "line_offset":
      value = lineOffset(a, b, c);
      break;
  }
  if (!Number.isFinite(value)) return null;
  return { value, visibility };
}

/**
 * Hacia dónde mira el alumno en una toma de costado. Combina la punta del pie
 * respecto del talón (estable de pie) y la nariz respecto de los hombros
 * (sirve en flexiones/plancha).
 */
export function estimateFacing(landmarks: Landmark[], side: Side, aspect: number): number {
  const foot = resolvePoint("foot", landmarks, side, aspect);
  const heel = resolvePoint("heel", landmarks, side, aspect);
  const nose = resolvePoint("nose", landmarks, side, aspect);
  const sh = resolvePoint("mid_shoulder", landmarks, side, aspect);
  let score = 0;
  if (foot && heel && foot.visibility > 0.4 && heel.visibility > 0.4) score += (foot.x - heel.x) * 2;
  if (nose && sh && nose.visibility > 0.4) score += nose.x - sh.x;
  return score;
}
