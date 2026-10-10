import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const body = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(240).default(""),
  url: z.string().startsWith("/").max(200).optional(),
  /** Si se omite, se manda a todos. */
  userIds: z.array(z.string().uuid()).max(500).optional(),
});

/** Envío manual de notificaciones (solo entrenadores). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "coach") return NextResponse.json({ error: "Solo entrenadores" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    const { sent } = await notifyUsers(parsed.data.userIds ?? null, parsed.data);
    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[push]", err);
    return NextResponse.json({ error: "No se pudo enviar" }, { status: 500 });
  }
}
