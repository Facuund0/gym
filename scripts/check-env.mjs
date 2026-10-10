// Revisa que estén las variables de entorno y prueba la conexión a cada servicio.
// Uso: npm run check-env   (lee .env.local)
import { existsSync, readFileSync } from "node:fs";

const file = existsSync(".env.local") ? ".env.local" : null;
const env = { ...process.env };
if (file) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} else {
  console.log("⚠️  No encontré .env.local (copiá .env.example → .env.local)\n");
}

const filled = (k) => env[k] && !/x{6,}/i.test(env[k]);
const groups = [
  { name: "Supabase (obligatorio)", keys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"] },
  { name: "Sitio", keys: ["NEXT_PUBLIC_SITE_URL"] },
  { name: "Gemini (opcional: reglas para ejercicios nuevos)", keys: ["GEMINI_API_KEY"] },
  {
    name: "Firebase (opcional: notificaciones push)",
    keys: [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
      "FIREBASE_SERVICE_ACCOUNT_BASE64",
    ],
  },
];

let ok = true;
for (const g of groups) {
  const missing = g.keys.filter((k) => !filled(k));
  console.log(`${missing.length ? "❌" : "✅"} ${g.name}${missing.length ? `\n     falta: ${missing.join(", ")}` : ""}`);
  if (missing.length && g.name.includes("obligatorio")) ok = false;
}

async function probe(label, fn) {
  try {
    const msg = await fn();
    console.log(`✅ ${label}${msg ? `: ${msg}` : ""}`);
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`);
  }
}

console.log("\nProbando conexiones…");
if (filled("NEXT_PUBLIC_SUPABASE_URL") && filled("SUPABASE_SECRET_KEY")) {
  await probe("Supabase (tablas creadas)", async () => {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/exercises?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, Prefer: "count=exact" },
    });
    if (r.status === 404) throw new Error("no existe la tabla exercises: corré la migración en el SQL Editor");
    if (!r.ok) throw new Error(`HTTP ${r.status} (¿clave correcta?)`);
    const total = r.headers.get("content-range")?.split("/")[1] ?? "?";
    return `${total} ejercicios cargados${total === "0" ? " (falta correr supabase/seed.sql)" : ""}`;
  });
  await probe("Supabase (hay un entrenador)", async () => {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=full_name&role=eq.coach`, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = await r.json();
    if (!rows.length) throw new Error("ningún perfil con role = 'coach' (ver docs/setup.md paso 1.7)");
    return rows.map((x) => x.full_name || "(sin nombre)").join(", ");
  });
}
if (filled("GEMINI_API_KEY")) {
  await probe(`Gemini (${env.GEMINI_MODEL ?? "gemini-3.8-flash"})`, async () => {
    const model = env.GEMINI_MODEL ?? "gemini-3.8-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${env.GEMINI_API_KEY}`);
    if (r.status === 404) throw new Error("el modelo no existe: revisá GEMINI_MODEL en https://ai.google.dev/gemini-api/docs/models");
    if (!r.ok) throw new Error(`HTTP ${r.status} (¿API key correcta?)`);
    return "clave y modelo OK";
  });
}
if (filled("FIREBASE_SERVICE_ACCOUNT_BASE64")) {
  await probe("Firebase (cuenta de servicio)", async () => {
    const json = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
    if (!json.private_key || !json.client_email) throw new Error("el JSON no parece una cuenta de servicio");
    if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && json.project_id !== env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      throw new Error(`project_id distinto: ${json.project_id} vs ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
    }
    return json.project_id;
  });
}

console.log(ok ? "\nListo para `npm run dev` 🚀" : "\nCompletá lo obligatorio antes de arrancar.");
process.exit(ok ? 0 : 1);
