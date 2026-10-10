"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Badge, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { fetchPrograms } from "@/lib/data";
import type { Program } from "@/lib/types";

const STATUS: Record<Program["status"], { label: string; tone: "ok" | "neutral" | "warn" }> = {
  active: { label: "Activo", tone: "ok" },
  draft: { label: "Borrador", tone: "warn" },
  archived: { label: "Terminado", tone: "neutral" },
};

export default function RutinaPage() {
  const { profile } = useProfile();
  const [programs, setPrograms] = useState<Program[] | null>(null);

  useEffect(() => {
    if (profile) void fetchPrograms(profile.id).then(setPrograms);
  }, [profile]);

  if (!programs) return <Loading />;
  return (
    <>
      <PageHeader title="Mis rutinas" subtitle="Tus programas de entrenamiento" />
      {programs.length === 0 ? (
        <EmptyState title="Todavía no tenés una rutina asignada">Tu entrenador te la va a cargar acá.</EmptyState>
      ) : (
        <div className="space-y-3">
          {programs.map((p) => (
            <Link key={p.id} href={`/rutina/${p.id}`} className="block">
              <Card className="transition hover:border-brand/60">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-xl font-bold uppercase">{p.title}</h2>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {p.weeks} semanas · {p.days_per_week} días por semana · desde{" "}
                  {new Date(`${p.start_date}T00:00:00`).toLocaleDateString("es-AR")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
