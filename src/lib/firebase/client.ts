"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";
import { createClient } from "@/lib/supabase/client";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const pushConfigured = Boolean(config.apiKey && config.projectId && process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);

function firebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

export type PushSupport = "ok" | "not-configured" | "unsupported" | "ios-needs-install" | "denied";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export async function pushSupport(): Promise<PushSupport> {
  if (!pushConfigured) return "not-configured";
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "ios-needs-install";
  if (!(await isSupported())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

/**
 * Pide permiso y registra el token en Supabase. Tiene que llamarse desde un
 * click del usuario (Safari ignora pedidos de permiso automáticos).
 */
export async function enablePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  const support = await pushSupport();
  if (support === "ios-needs-install") {
    return { ok: false, error: "En iPhone primero instalá la app: Compartir → Agregar a inicio, y abrila desde el ícono." };
  }
  if (support !== "ok") return { ok: false, error: "Este navegador no permite notificaciones." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "No diste permiso para notificaciones." };

  const registration = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp()), {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, error: "No se pudo obtener el token de notificaciones." };

  const supabase = createClient();
  const { error } = await supabase
    .from("push_tokens")
    .upsert({ user_id: userId, token, user_agent: navigator.userAgent, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Notificaciones que llegan con la app abierta (el service worker no las muestra). */
export async function onForegroundPush(cb: (p: { title: string; body: string; url?: string }) => void): Promise<() => void> {
  if ((await pushSupport()) !== "ok") return () => {};
  return onMessage(getMessaging(firebaseApp()), (payload: MessagePayload) => {
    const d = payload.data ?? {};
    cb({
      title: d.title ?? payload.notification?.title ?? "Novedad",
      body: d.body ?? payload.notification?.body ?? "",
      url: d.url,
    });
  });
}
