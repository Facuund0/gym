import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createAdminClient } from "@/lib/supabase/admin";

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_BASE64");
  const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  return initializeApp({ credential: cert(json) });
}

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocar la notificación (ej. "/novedades"). */
  url?: string;
  tag?: string;
}

const INVALID = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Envía a una lista de tokens y devuelve los que hay que borrar. */
async function sendToTokens(tokens: string[], payload: PushPayload): Promise<{ sent: number; invalid: string[] }> {
  if (tokens.length === 0) return { sent: 0, invalid: [] };
  const messaging = getMessaging(app());
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${base}${payload.url ?? "/inicio"}`;
  let sent = 0;
  const invalid: string[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      // Mensaje "data" + webpush: nuestro service worker (public/sw.js) arma la notificación.
      data: { title: payload.title, body: payload.body, url: payload.url ?? "/inicio", tag: payload.tag ?? "" },
      webpush: {
        headers: { Urgency: "high", TTL: "86400" },
        notification: { title: payload.title, body: payload.body, icon: "/icon-192.png", badge: "/icon-192.png" },
        fcmOptions: link.startsWith("https://") ? { link } : undefined,
      },
    });
    sent += res.successCount;
    res.responses.forEach((r, idx) => {
      if (!r.success && r.error && INVALID.has(r.error.code)) invalid.push(chunk[idx]);
    });
  }
  return { sent, invalid };
}

/**
 * Envía una notificación a usuarios (o a todos si userIds es null) y limpia tokens vencidos.
 * Si Firebase no está configurado, no falla: devuelve sent = 0.
 */
export async function notifyUsers(userIds: string[] | null, payload: PushPayload): Promise<{ sent: number }> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) return { sent: 0 };
  const admin = createAdminClient();
  let q = admin.from("push_tokens").select("token");
  if (userIds) q = q.in("user_id", userIds);
  const { data } = await q;
  const tokens = Array.from(new Set((data ?? []).map((r) => r.token as string)));
  const { sent, invalid } = await sendToTokens(tokens, payload);
  if (invalid.length) await admin.from("push_tokens").delete().in("token", invalid);
  return { sent };
}
