// Índices de los 33 puntos de MediaPipe Pose (BlazePose).
// "left"/"right" son del PUNTO DE VISTA DEL ALUMNO, no de la imagen.
export const LANDMARK = {
  nose: 0,
  left_ear: 7,
  right_ear: 8,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot: 31, // foot_index (punta del pie)
  right_foot: 32,
} as const;

export const JOINTS = [
  "nose",
  "ear",
  "shoulder",
  "elbow",
  "wrist",
  "hip",
  "knee",
  "ankle",
  "heel",
  "foot",
] as const;
export type Joint = (typeof JOINTS)[number];
export type Side = "left" | "right";

// Conexiones para dibujar el esqueleto (sin la cara, que no aporta acá).
export const SKELETON: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

export interface Landmark {
  x: number; // 0..1 respecto del ancho de la imagen
  y: number; // 0..1 respecto del alto (crece hacia abajo)
  z?: number;
  visibility?: number;
}

export interface Point2 {
  x: number;
  y: number;
  visibility: number;
}

/** Referencia a un punto: "knee" (lado elegido), "left_knee", "right_knee" o "mid_knee". */
export const POINT_REF_PATTERN = /^(left_|right_|mid_)?(nose|ear|shoulder|elbow|wrist|hip|knee|ankle|heel|foot)$/;

function indexFor(side: Side, joint: Joint): number {
  if (joint === "nose") return LANDMARK.nose;
  return LANDMARK[`${side}_${joint}` as keyof typeof LANDMARK];
}

/**
 * Resuelve una referencia a coordenadas corregidas por aspecto (x * aspect),
 * para que los ángulos medidos en la imagen sean reales y no estén deformados
 * cuando el video no es cuadrado.
 */
export function resolvePoint(
  ref: string,
  landmarks: Landmark[],
  side: Side,
  aspect: number,
): Point2 | null {
  const m = POINT_REF_PATTERN.exec(ref);
  if (!m) return null;
  const prefix = m[1];
  const joint = m[2] as Joint;
  const toPoint = (idx: number): Point2 | null => {
    const l = landmarks[idx];
    if (!l) return null;
    return { x: l.x * aspect, y: l.y, visibility: l.visibility ?? 1 };
  };
  if (prefix === "mid_") {
    const a = toPoint(indexFor("left", joint));
    const b = toPoint(indexFor("right", joint));
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility, b.visibility) };
  }
  const s: Side = prefix === "left_" ? "left" : prefix === "right_" ? "right" : side;
  return toPoint(indexFor(s, joint));
}

/** Qué lado se ve mejor (para ejercicios filmados de costado). */
export function visibleSide(landmarks: Landmark[], joints: readonly Joint[]): Side {
  let left = 0;
  let right = 0;
  for (const j of joints) {
    if (j === "nose") continue;
    left += landmarks[indexFor("left", j)]?.visibility ?? 0;
    right += landmarks[indexFor("right", j)]?.visibility ?? 0;
  }
  return left >= right ? "left" : "right";
}

export function jointOf(ref: string): Joint | null {
  const m = POINT_REF_PATTERN.exec(ref);
  return m ? (m[2] as Joint) : null;
}
