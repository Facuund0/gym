"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";
import { CURATED_KEYS, CURATED_RULES } from "@/lib/pose/library";
import { resolveRules } from "@/lib/pose/resolve";
import { safeParseRuleSet } from "@/lib/pose/schema";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/client";
import type { Exercise } from "@/lib/types";

export function ExerciseLibrary() {
  const params = useSearchParams();
  const [items, setItems] = useState<Exercise[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyAi, setOnlyAi] = useState(params.get("filtro") === "ia");
  const [editing, setEditing] = useState<Exercise | "new" | null>(null);

  const load = () =>
    void createClient()
      .from("exercises")
      .select("*")
      .order("name")
      .then(({ data }) => setItems((data as Exercise[]) ?? []));
  useEffect(load, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items ?? []).filter(
      (e) => (!n || e.name.toLowerCase().includes(n)) && (!onlyAi || (e.rules_source === "gemini" && !e.rules_reviewed)),
    );
  }, [items, q, onlyAi]);

  if (editing) {
    return (
      <ExerciseForm
        initial={editing === "new" ? null : editing}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Ejercicios"
        subtitle="Biblioteca del gimnasio y reglas de técnica"
        action={<Button size="sm" onClick={() => setEditing("new")}>+ Nuevo</Button>}
      />
      <div className="mb-3 flex gap-2">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant={onlyAi ? "primary" : "secondary"} onClick={() => setOnlyAi(!onlyAi)}>
          IA sin revisar
        </Button>
      </div>
      {!items ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay ejercicios">Cargá el seed inicial (supabase/seed.sql) o creá uno nuevo.</EmptyState>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const { origin } = resolveRules(e);
            return (
              <button key={e.id} className="block w-full text-left" onClick={() => setEditing(e)}>
                <Card className="flex items-center justify-between gap-2 py-3 transition hover:border-brand/60">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.name}</p>
                    <p className="truncate text-xs text-muted">{e.category ?? "Sin categoría"}</p>
                  </div>
                  {origin === "none" ? (
                    <Badge>Sin reglas</Badge>
                  ) : e.rules_source === "gemini" && !e.rules_reviewed ? (
                    <Badge tone="warn">IA · revisar</Badge>
                  ) : (
                    <Badge tone="ok">Técnica ✓</Badge>
                  )}
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ExerciseForm({ initial, onClose }: { initial: Exercise | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cues, setCues] = useState((initial?.cues ?? []).join("\n"));
  const [video, setVideo] = useState(initial?.video_url ?? "");
  const [ruleKey, setRuleKey] = useState(initial?.rule_key ?? "");
  const [rulesJson, setRulesJson] = useState(initial?.pose_rules ? JSON.stringify(initial.pose_rules, null, 2) : "");
  const [reviewed, setReviewed] = useState(initial?.rules_reviewed ?? false);
  const [source, setSource] = useState(initial?.rules_source ?? null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const resolved = resolveRules({ name, rule_key: ruleKey || null, pose_rules: rulesJson ? safeJson(rulesJson) : null });

  async function save() {
    setSaving(true);
    setError(null);
    let pose_rules: unknown = null;
    if (rulesJson.trim()) {
      const parsed = safeParseRuleSet(safeJson(rulesJson));
      if (!parsed.success) {
        setSaving(false);
        return setError(`Las reglas no son válidas: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      }
      pose_rules = parsed.data;
    }
    const sourceChanged = initial?.pose_rules && JSON.stringify(initial.pose_rules) !== JSON.stringify(pose_rules);
    const row = {
      name: name.trim(),
      slug: initial?.slug ?? slugify(name),
      category: category || null,
      equipment: equipment || null,
      description: description || null,
      cues: cues.split("\n").map((c) => c.trim()).filter(Boolean),
      video_url: video || null,
      rule_key: ruleKey || null,
      pose_rules,
      rules_source: pose_rules ? (sourceChanged ? "coach" : source ?? "coach") : ruleKey ? "curated" : null,
      rules_reviewed: pose_rules ? reviewed || Boolean(sourceChanged) : true,
    };
    const sb = createClient();
    const { error } = initial ? await sb.from("exercises").update(row).eq("id", initial.id) : await sb.from("exercises").insert(row);
    setSaving(false);
    if (error) setError(error.message.includes("duplicate") ? "Ya existe un ejercicio con ese nombre." : error.message);
    else onClose();
  }

  async function generate() {
    setAiLoading(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/exercises/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId: initial?.id, name, description: description || undefined, force: true }),
    });
    const json = await res.json();
    setAiLoading(false);
    if (!res.ok || !json.rules) return setError(json.error ?? "No se pudieron generar");
    setRulesJson(JSON.stringify(json.rules, null, 2));
    setSource("gemini");
    setReviewed(false);
    setMsg("Reglas generadas. Probalas con la cámara y marcalas como revisadas si funcionan bien.");
  }

  async function remove() {
    if (!initial || !confirm(`¿Borrar "${initial.name}"? Los programas que lo usan conservan el nombre.`)) return;
    await createClient().from("exercises").delete().eq("id", initial.id);
    onClose();
  }

  return (
    <>
      <button onClick={onClose} className="mb-2 text-sm text-muted">
        ← Ejercicios
      </button>
      <h1 className="mb-4 font-display text-3xl font-bold uppercase">{initial ? "Editar ejercicio" : "Nuevo ejercicio"}</h1>
      <div className="space-y-3">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Sentadilla búlgara" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Categoría (planilla)">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Equipamiento">
            <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Barra, mancuernas…" />
          </Field>
        </div>
        <Field label="Descripción" hint="también ayuda a la IA a generar mejores reglas">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Consignas técnicas" hint="una por línea, las ve el alumno">
          <Textarea value={cues} onChange={(e) => setCues(e.target.value)} />
        </Field>
        <Field label="Video de referencia" hint="link de YouTube/Drive, opcional">
          <Input value={video} onChange={(e) => setVideo(e.target.value)} />
        </Field>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Detección de técnica con cámara</p>
            {resolved.rules ? <Badge tone="ok">{resolved.rules.name}</Badge> : <Badge>Sin reglas</Badge>}
          </div>
          <Field label="Usar reglas de la biblioteca">
            <Select value={ruleKey} onChange={(e) => setRuleKey(e.target.value)}>
              <option value="">Automático por nombre</option>
              {CURATED_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CURATED_RULES[k].name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={generate} loading={aiLoading} disabled={name.trim().length < 3}>
              Generar reglas con IA
            </Button>
            {name.trim() && (
              <Link href={`/tecnica/${initial?.slug ?? slugify(name)}?name=${encodeURIComponent(name)}`}>
                <Button variant="ghost" size="sm">
                  Probar con la cámara
                </Button>
              </Link>
            )}
          </div>
          {msg && <p className="text-sm text-ok">{msg}</p>}
          <Field label="Reglas propias (JSON)" hint="avanzado; vacío = usar la biblioteca">
            <Textarea className="min-h-40 font-mono text-xs" value={rulesJson} onChange={(e) => setRulesJson(e.target.value)} />
          </Field>
          {rulesJson.trim() && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              Revisé estas reglas y funcionan bien
            </label>
          )}
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex gap-2">
          {initial && (
            <Button variant="danger" onClick={remove}>
              Borrar
            </Button>
          )}
          <Button className="flex-1" onClick={save} loading={saving} disabled={name.trim().length < 2}>
            Guardar
          </Button>
        </div>
      </div>
    </>
  );
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
