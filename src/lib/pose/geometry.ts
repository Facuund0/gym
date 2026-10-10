import type { Point2 } from "./landmarks";

const RAD = 180 / Math.PI;

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ángulo interno en B (grados, 0..180) formado por A-B-C. */
export function angleAt(a: Point2, b: Point2, c: Point2): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / n));
  return Math.acos(cos) * RAD;
}

/**
 * Inclinación del segmento from→to respecto de la vertical hacia ARRIBA (grados).
 * 0 = "to" está justo encima de "from"; 90 = horizontal; 180 = justo debajo.
 * Ej.: inclinación cadera→hombro de 0 es torso vertical, 45 es torso a 45°.
 */
export function inclination(from: Point2, to: Point2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y; // y crece hacia abajo
  const n = Math.hypot(dx, dy);
  if (n === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, -dy / n));
  return Math.acos(cos) * RAD;
}

/**
 * Distancia perpendicular con signo de B a la recta A→C, normalizada por |AC|.
 * Positivo = B está por ENCIMA de la recta (en la imagen). Sirve para detectar
 * cadera caída (negativo) o cadera muy alta (positivo) en plancha/flexiones.
 */
export function lineOffset(a: Point2, b: Point2, c: Point2): number {
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const len = Math.hypot(acx, acy);
  if (len === 0) return NaN;
  // proyección de B sobre AC
  const t = ((b.x - a.x) * acx + (b.y - a.y) * acy) / (len * len);
  const py = a.y + t * acy;
  const px = a.x + t * acx;
  const d = Math.hypot(b.x - px, b.y - py) / len;
  return b.y < py ? d : -d;
}

/** Media móvil exponencial simple. */
export function ema(prev: number | undefined, next: number, alpha: number): number {
  return prev === undefined || Number.isNaN(prev) ? next : prev + alpha * (next - prev);
}
