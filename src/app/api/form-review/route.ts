import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { reviewKeyframes } from "@/lib/gemini/server";
import { checkAndCountAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FRAME_BYTES = 250_000; // ~250 KB por imagen en base64

const body = z.object({
  consent: z.literal(true),
  exerciseName: z.string().min(1).max(120),
  summary: z.object({
    reps: z.number().int().min(0),
    score: z.number().min(0).max(100).nullable(),
    issues: z.array(z.object({ label: z.string(), count: z.number().int() })).max(12),
  }),
  frames: z.array(z.string().max(MAX_FRAME_BYTES)).min(1).max(4),
});

/** Devolución escrita opcional de Gemini sobre fotogramas clave (requiere consentimiento). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "IA no configurada" }, { status: 503 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const usage = await checkAndCountAiUsage(user.id, user.role, "review");
  if (!usage.ok) return NextResponse.json({ error: `Límite diario de ${usage.limit} devoluciones alcanzado` }, { status: 429 });

  try {
    const frames = parsed.data.frames.map((f) => f.replace(/^data:image\/\w+;base64,/, ""));
    const review = await reviewKeyframes({ ...parsed.data, frames });
    return NextResponse.json({ review });
  } catch (err) {
    console.error("[form-review]", err);
    return NextResponse.json({ error: "No se pudo obtener la devolución" }, { status: 502 });
  }
}
