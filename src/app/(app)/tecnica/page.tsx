"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { CURATED_RULES } from "@/lib/pose/library";
import { resolveRules } from "@/lib/pose/resolve";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/client";
import type { Exercise } from "@/lib/types";

export default function TecnicaPage() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    void createClient()
      .from("exercises")
      .select("*")
      .order("name")
      .then(({ data }) => setExercises((data as Exercise[]) ?? []));
  }, []);

  // Ejercicios de la base + los de la biblioteca curada que no estén cargados.
  const items = useMemo(() => {
    const fromDb = exercises.map((e) => ({ name: e.name, slug: e.slug, origin: resolveRules(e).origin, ai: e.rules_source === "gemini" }));
    const known = new Set(fromDb.map((e) => e.slug));
    const curated = Object.values(CURATED_RULES)
      .filter((r) => !known.has(slugify(r.name)))
      .map((r) => ({ name: r.name, slug: slugify(r.name), origin: "curated" as const, ai: false }));
    const all = [...fromDb, ...curated];
    const n = q.trim().toLowerCase();
    return n ? all.filter((e) => e.name.toLowerCase().includes(n)) : all;
  }, [exercises, q]);

  return (
    <>
      <PageHeader title="Técnica" subtitle="Elegí un ejercicio y la cámara te corrige en vivo." />
      <Card className="mb-4 border-brand/30 bg-brand/5">
        <p className="text-sm">
          El análisis corre <strong>en tu teléfono</strong>: no se graba ni se sube video. Apoyá el celular a 2-3 metros y
          seguí las indicaciones de voz.
        </p>
      </Card>
      <Input placeholder="Buscar ejercicio…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <div className="space-y-2">
        {items.map((e) => (
          <Link key={e.slug} href={`/tecnica/${e.slug}?name=${encodeURIComponent(e.name)}`} className="block">
            <Card className="flex items-center justify-between py-3 transition hover:border-brand/60">
              <span className="font-semibold">{e.name}</span>
              {e.origin === "none" ? (
                <Badge>Se genera con IA</Badge>
              ) : e.ai ? (
                <Badge tone="warn">IA</Badge>
              ) : (
                <Badge tone="ok">Listo</Badge>
              )}
            </Card>
          </Link>
        ))}
        {q.trim().length > 2 && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push(`/tecnica/${slugify(q)}?name=${encodeURIComponent(q.trim())}`)}
          >
            Analizar “{q.trim()}” (ejercicio nuevo)
          </Button>
        )}
      </div>
    </>
  );
}
