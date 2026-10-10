import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const body = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(4000).default(""),
  image_url: z.string().url().nullable().optional(),
  pinned: z.boolean().default(false),
  notify: z.boolean().default(true),
});

/** Publica una novedad y avisa a todos por push. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "coach") return NextResponse.json({ error: "Solo entrenadores" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { notify, ...row } = parsed.data;

  // Insert con la sesión del coach (pasa por RLS)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ ...row, author_id: user.id })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let sent = 0;
  if (notify) {
    try {
      sent = (await notifyUsers(null, { title: row.title, body: row.body.slice(0, 140), url: "/novedades", tag: "novedad" })).sent;
    } catch (err) {
      console.error("[announcements] push", err);
    }
  }
  return NextResponse.json({ announcement: data, sent });
}
