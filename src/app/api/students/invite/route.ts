import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const body = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(120),
  goal: z.string().max(300).optional(),
  /**
   * Si viene, se crea la cuenta directamente con esta contraseña (sin mandar mail).
   * Útil con el plan gratuito de Supabase, que sin SMTP propio casi no manda mails.
   */
  password: z.string().min(8).max(72).optional(),
});

/**
 * Alta de alumnos. Dos modos:
 * - con contraseña: se crea la cuenta ya confirmada y el coach le pasa los datos al alumno.
 * - sin contraseña: se manda la invitación por mail (usa la plantilla por defecto de
 *   Supabase; el link vuelve a /auth/bienvenida, que toma la sesión del link).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "coach") return NextResponse.json({ error: "Solo entrenadores" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revisá el mail, el nombre y que la contraseña tenga 8 caracteres o más" }, { status: 400 });
  }
  const { email, full_name, goal, password } = parsed.data;
  const admin = createAdminClient();

  let userId: string | null = null;
  if (password) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    userId = data.user?.id ?? null;
  } else {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: `${origin}/auth/bienvenida`,
    });
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: 400 });
    userId = data.user?.id ?? null;
  }

  if (userId) {
    await admin.from("profiles").upsert({ id: userId, full_name, goal: goal ?? null, role: "student" });
  }
  return NextResponse.json({ ok: true, userId, mode: password ? "password" : "invite" });
}

function friendly(msg: string): string {
  if (/already been registered|already registered|already exists/i.test(msg)) return "Ese mail ya tiene cuenta.";
  if (/rate limit|too many/i.test(msg)) {
    return "Supabase no deja mandar más mails por ahora (límite del plan gratis). Creá al alumno con contraseña.";
  }
  return msg;
}
