import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la SECRET key (saltea RLS). Solo en el servidor y solo para:
 * invitar alumnos, enviar push a todos, guardar reglas generadas por Gemini
 * y registrar uso de IA. Nunca importarlo desde un componente de cliente.
 */
export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY en las variables de entorno");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
