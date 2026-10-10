"use client";

import { useEffect } from "react";

/** Registra el service worker (PWA instalable + base para notificaciones push). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.warn("SW", err));
  }, []);
  return null;
}
