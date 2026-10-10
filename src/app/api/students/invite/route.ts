import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const body = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(120),
  goal: z.string().max(300).optional(),
});

/** El coach invita a un alumno por mail; el alumno entra y elige su contraseña. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "coach") return NextResponse.json({ error: "Solo entrenadores" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisá el mail y el nombre" }, { status: 400 });
  const { email, full_name, goal } = parsed.data;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo: `${origin}/auth/confirm?next=/perfil?bienvenida=1`,
  });
  if (error) {
    const msg = /already been registered|already registered/i.test(error.message)
      ? "Ese mail ya tiene cuenta."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (data.user) {
    await admin.from("profiles").upsert({ id: data.user.id, full_name, goal: goal ?? null, role: "student" });
  }
  return NextResponse.json({ ok: true, userId: data.user?.id ?? null });
}
