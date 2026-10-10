"use client";

import type { ReactNode } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { EmptyState } from "@/components/ui";

// La protección real está en las políticas RLS; esto solo evita mostrar pantallas vacías.
export default function CoachLayout({ children }: { children: ReactNode }) {
  const { isCoach } = useProfile();
  if (!isCoach) return <EmptyState title="Esta sección es solo para entrenadores" />;
  return <>{children}</>;
}
