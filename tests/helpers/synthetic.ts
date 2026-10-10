import type { Landmark } from "@/lib/pose/landmarks";

/**
 * Genera un "muñeco" de 33 landmarks visto de costado, mirando a la derecha,
 * para testear el motor sin cámara.
 */
export function sideFigure(opts: {
  kneeAngle: number;
  torsoLean?: number; // inclinación del torso desde la vertical (grados)
  heelLift?: number; // cuánto se levanta el talón (unidades normalizadas)
  elbowAngle?: number;
}): Landmark[] {
  const rad = Math.PI / 180;
  const L = 0.2; // largo de pierna y muslo
  const T = 0.25; // torso
  const ankle = { x: 0.5, y: 0.85 };
  const half = (180 - opts.kneeAngle) / 2;
  const knee = { x: ankle.x + L * Math.sin(half * rad), y: ankle.y - L * Math.cos(half * rad) };
  const hip = { x: knee.x - L * Math.sin(half * rad), y: knee.y - L * Math.cos(half * rad) };
  const lean = opts.torsoLean ?? 20;
  const shoulder = { x: hip.x + T * Math.sin(lean * rad), y: hip.y - T * Math.cos(lean * rad) };
  const ear = { x: shoulder.x + 0.03, y: shoulder.y - 0.06 };
  const nose = { x: shoulder.x + 0.06, y: shoulder.y - 0.06 };
  // brazo colgando o flexionado
  const elbow = { x: shoulder.x, y: shoulder.y + 0.13 };
  const ea = (opts.elbowAngle ?? 170) * rad;
  const wrist = { x: elbow.x + 0.13 * Math.sin(Math.PI - ea), y: elbow.y + 0.13 * Math.cos(Math.PI - ea) };
  const lift = opts.heelLift ?? 0;
  const heel = { x: ankle.x - 0.03, y: ankle.y + 0.03 - lift };
  const foot = { x: ankle.x + 0.08, y: ankle.y + 0.03 };

  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const set = (i: number, p: { x: number; y: number }) => (lm[i] = { x: p.x, y: p.y, z: 0, visibility: 0.99 });
  set(0, nose);
  for (const [l, r, p] of [
    [7, 8, ear],
    [11, 12, shoulder],
    [13, 14, elbow],
    [15, 16, wrist],
    [23, 24, hip],
    [25, 26, knee],
    [27, 28, ankle],
    [29, 30, heel],
    [31, 32, foot],
  ] as const) {
    set(l, p);
    set(r, p);
  }
  return lm;
}

/** Secuencia de valores que va de `top` a `bottom` y vuelve, `reps` veces. */
export function cycle(top: number, bottom: number, reps: number, framesPerRep = 60, pauseFrames = 15): number[] {
  const out: number[] = [];
  for (let i = 0; i < pauseFrames; i++) out.push(top);
  for (let r = 0; r < reps; r++) {
    for (let f = 0; f < framesPerRep; f++) {
      const phase = (f / framesPerRep) * 2 * Math.PI;
      out.push(top - ((top - bottom) * (1 - Math.cos(phase))) / 2);
    }
    for (let i = 0; i < pauseFrames; i++) out.push(top);
  }
  return out;
}
