import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Límites diarios por usuario para cuidar la cuota gratuita de Gemini.
// Se pueden ajustar por variables de entorno.
const LIMITS = {
  rules: { coach: Number(process.env.AI_RULES_PER_DAY_COACH ?? 30), student: Number(process.env.AI_RULES_PER_DAY_STUDENT ?? 5) },
  review: { coach: Number(process.env.AI_REVIEWS_PER_DAY ?? 10), student: Number(process.env.AI_REVIEWS_PER_DAY ?? 10) },
};

export async function checkAndCountAiUsage(
  userId: string,
  role: "coach" | "student",
  kind: "rules" | "review",
): Promise<{ ok: true } | { ok: false; limit: number }> {
  const admin = createAdminClient();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since.toISOString());
  const limit = LIMITS[kind][role];
  if ((count ?? 0) >= limit) return { ok: false, limit };
  await admin.from("ai_usage").insert({ user_id: userId, kind });
  return { ok: true };
}
