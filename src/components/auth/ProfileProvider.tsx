"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

interface ProfileState {
  profile: Profile | null;
  email: string | null;
  loading: boolean;
  isCoach: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ProfileState | null>(null);

async function fetchCurrentProfile(): Promise<{ email: string | null; profile: Profile | null } | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
  return { email: auth.user.email ?? null, profile: (data as Profile) ?? null };
}

/**
 * Carga el perfil del usuario logueado en el cliente. La seguridad real la
 * ponen las políticas RLS de Supabase; esto es solo para la interfaz.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    () =>
      fetchCurrentProfile().then((r) => {
        if (!r) {
          router.replace("/login");
          return;
        }
        setEmail(r.email);
        setProfile(r.profile);
        setLoading(false);
      }),
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentProfile().then((r) => {
      if (cancelled) return;
      if (!r) return router.replace("/login");
      setEmail(r.email);
      setProfile(r.profile);
      setLoading(false);
    });
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <Ctx value={{ profile, email, loading, isCoach: profile?.role === "coach", refresh: load }}>{children}</Ctx>
  );
}

export function useProfile(): ProfileState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfile debe usarse dentro de ProfileProvider");
  return v;
}
