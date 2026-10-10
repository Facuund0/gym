"use client";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";

// Mantener alineado con la versión de @mediapipe/tasks-vision en package.json.
const TASKS_VISION_VERSION = "1.1.0";

const WASM_URL =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_URL ?? `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

/**
 * Modelos de pose: "lite" (~5 MB, rápido, ideal celulares), "full" (más preciso),
 * "heavy" (solo computadoras potentes). Se pueden alojar en /public/models y
 * apuntar con NEXT_PUBLIC_POSE_MODEL_URL para no depender de Google.
 */
export type PoseModel = "lite" | "full" | "heavy";
const MODEL_URL = (m: PoseModel) =>
  process.env.NEXT_PUBLIC_POSE_MODEL_URL ??
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;

export async function createPoseLandmarker(model: PoseModel = "lite"): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_URL(model), delegate },
    runningMode: "VIDEO" as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await PoseLandmarker.createFromOptions(vision, options("GPU"));
  } catch (err) {
    console.warn("[pose] GPU no disponible, uso CPU", err);
    return PoseLandmarker.createFromOptions(vision, options("CPU"));
  }
}
