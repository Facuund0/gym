"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Loading, PageHeader, Textarea } from "@/components/ui";
import { fetchAnnouncements } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { Announcement } from "@/lib/types";

export default function NovedadesPage() {
  const { isCoach } = useProfile();
  const [items, setItems] = useState<Announcement[] | null>(null);

  const load = () => void fetchAnnouncements(50).then(setItems);
  useEffect(load, []);

  async function remove(id: string) {
    if (!confirm("¿Borrar esta novedad?")) return;
    await createClient().from("announcements").delete().eq("id", id);
    load();
  }

  async function togglePin(a: Announcement) {
    await createClient().from("announcements").update({ pinned: !a.pinned }).eq("id", a.id);
    load();
  }

  return (
    <>
      <PageHeader title="Novedades" subtitle="Avisos, horarios, eventos y tips del gimnasio" />
      {isCoach && <Composer onPublished={load} />}
      {!items ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title="Todavía no hay novedades" />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold">{a.title}</h2>
                {a.pinned && <Badge tone="brand">Fijada</Badge>}
              </div>
              <p className="text-xs text-muted">
                {new Date(a.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
              </p>
              {a.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.image_url} alt="" className="mt-3 max-h-80 w-full rounded-xl object-cover" />
              )}
              {a.body && <p className="mt-3 whitespace-pre-line">{a.body}</p>}
              {isCoach && (
                <div className="mt-3 flex gap-3 text-sm">
                  <button className="text-muted underline" onClick={() => togglePin(a)}>
                    {a.pinned ? "Desfijar" : "Fijar arriba"}
                  </button>
                  <button className="text-bad underline" onClick={() => remove(a.id)}>
                    Borrar
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Composer({ onPublished }: { onPublished: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notify, setNotify] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function publish() {
    setLoading(true);
    setError(null);
    try {
      let image_url: string | null = null;
      if (file) {
        const sb = createClient();
        const path = `novedades/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
        const { error: upErr } = await sb.storage.from("media").upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        image_url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
      }
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, image_url, pinned, notify }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al publicar");
      setResult(notify ? `Publicada. Notificación enviada a ${json.sent} dispositivo(s).` : "Publicada.");
      setTitle("");
      setBody("");
      setFile(null);
      setOpen(false);
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4 space-y-2">
        <Button className="w-full" onClick={() => setOpen(true)}>
          + Nueva novedad
        </Button>
        {result && <p className="text-center text-sm text-ok">{result}</p>}
      </div>
    );
  }

  return (
    <Card className="mb-4 space-y-3">
      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: El lunes 12 abrimos a las 9" />
      </Field>
      <Field label="Texto">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Imagen" hint="opcional">
        <Input type="file" accept="image/*" className="pt-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Avisar por notificación push
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fijar arriba
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={publish} loading={loading} disabled={!title.trim()}>
          Publicar
        </Button>
      </div>
    </Card>
  );
}
