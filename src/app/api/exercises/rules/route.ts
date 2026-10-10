import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRulesForExercise } from "@/lib/gemini/server";
import { checkAndCountAiUsage } from "@/lib/ai-usage";
import { resolveRules } from "@/lib/pose/resolve";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  exerciseId: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(600).optional(),
  /** Solo el coach puede forzar regenerar reglas existentes. */
  force: z.boolean().optional(),
});

/**
 * Devuelve las reglas de técnica de un ejercicio. Si no hay (ni propias ni en la
 * biblioteca curada), las genera con Gemini UNA vez y las guarda para todos.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { exerciseId, name, description } = parsed.data;
  const force = parsed.data.force && user.role === "coach";

  const admin = createAdminClient();
  const slug = slugify(name);

  // 1) ¿Ya existe el ejercicio (por id o por slug) con reglas?
  const query = admin.from("exercises").select("id, name, rule_key, pose_rules, description, rules_source");
  const { data: existing } = exerciseId
    ? await query.eq("id", exerciseId).maybeSingle()
    : await query.eq("slug", slug).maybeSingle();

  if (!force) {
    const resolved = resolveRules({
      name: existing?.name ?? name,
      rule_key: existing?.rule_key,
      pose_rules: existing?.pose_rules,
    });
    if (resolved.rules) {
      return NextResponse.json({ rules: resolved.rules, origin: resolved.origin, exerciseId: existing?.id ?? null });
    }
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "La IA no está configurada (falta GEMINI_API_KEY)", fallback: "auto" }, { status: 503 });
  }

  // 2) Cuota diaria
  const usage = await checkAndCountAiUsage(user.id, user.role, "rules");
  if (!usage.ok) {
    return NextResponse.json(
      { error: `Llegaste al límite diario de ${usage.limit} generaciones con IA`, fallback: "auto" },
      { status: 429 },
    );
  }

  // 3) Generar con Gemini y guardar
  try {
    const rules = await generateRulesForExercise(existing?.name ?? name, description ?? existing?.description);
    let savedId = existing?.id ?? null;
    if (existing) {
      await admin
        .from("exercises")
        .update({ pose_rules: rules, rules_source: "gemini", rules_reviewed: false })
        .eq("id", existing.id);
    } else {
      const { data: inserted } = await admin
        .from("exercises")
        .insert({
          name,
          slug,
          description: description ?? null,
          pose_rules: rules,
          rules_source: "gemini",
          rules_reviewed: false,
          created_by: user.id,
        })
        .select("id")
        .single();
      savedId = inserted?.id ?? null;
    }
    return NextResponse.json({ rules, origin: "gemini", exerciseId: savedId });
  } catch (err) {
    console.error("[rules] Gemini error", err);
    return NextResponse.json(
      { error: "No se pudieron generar reglas con IA. Podés usar el modo automático.", fallback: "auto" },
      { status: 502 },
    );
  }
}
