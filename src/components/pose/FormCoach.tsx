"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { useProfile } from "@/components/auth/ProfileProvider";
import { Badge, Button, Card, ErrorNote, Spinner, cn } from "@/components/ui";
import { AutoCalibrator } from "@/lib/pose/auto";
import { FormAnalyzer, type ActiveIssue, type AnalyzerEvent, type SessionSummary } from "@/lib/pose/analyzer";
import { SKELETON, type Landmark } from "@/lib/pose/landmarks";
import { createPoseLandmarker } from "@/lib/pose/landmarker";
import { resolveRules } from "@/lib/pose/resolve";
import { safeParseRuleSet, type RuleSet } from "@/lib/pose/schema";
import { Speaker } from "@/lib/pose/speech";
import { createClient } from "@/lib/supabase/client";

type Stage = "loading" | "setup" | "starting" | "running" | "summary";
type Origin = "curated" | "alias" | "custom" | "gemini" | "auto";

interface Hud {
  status: "no_person" | "not_visible" | "tracking" | "calibrating";
  reps: number;
  partials: number;
  holdSeconds: number;
  issues: ActiveIssue[];
  calibration: number;
  missing: string;
}

const ORIGIN_LABEL: Record<Origin, { text: string; tone: "ok" | "brand" | "warn" | "neutral" }> = {
  curated: { text: "Reglas del gimnasio", tone: "ok" },
  alias: { text: "Reglas del gimnasio", tone: "ok" },
  custom: { text: "Reglas del entrenador", tone: "ok" },
  gemini: { text: "Reglas generadas con IA", tone: "warn" },
  auto: { text: "Modo automático (solo cuenta)", tone: "neutral" },
};

export function FormCoach({
  slug,
  name,
  programExerciseId,
}: {
  slug: string;
  name: string;
  programExerciseId?: string | null;
}) {
  const { profile } = useProfile();
  const [stage, setStage] = useState<Stage>("loading");
  const [rules, setRules] = useState<RuleSet | null>(null);
  const [origin, setOrigin] = useState<Origin>("auto");
  const [reviewed, setReviewed] = useState(true);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState(name);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [voiceOn, setVoiceOn] = useState(true);
  const [aiConsent, setAiConsent] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cue, setCue] = useState<{ text: string; severity: string } | null>(null);
  const [hud, setHud] = useState<Hud>({ status: "no_person", reps: 0, partials: 0, holdSeconds: 0, issues: [], calibration: 0, missing: "" });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [checkId, setCheckId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const analyzerRef = useRef<FormAnalyzer | null>(null);
  const calibratorRef = useRef<AutoCalibrator | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const lastHud = useRef(0);
  const lastRegion = useRef<string | null>(null);
  const keyframes = useRef<string[]>([]);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const voiceRef = useRef(voiceOn);
  const consentRef = useRef(aiConsent);
  const tickRef = useRef<() => void>(() => {});
  const [frameCount, setFrameCount] = useState(0);

  // Los callbacks del bucle de video leen estas preferencias desde refs
  useEffect(() => {
    voiceRef.current = voiceOn;
  }, [voiceOn]);
  useEffect(() => {
    consentRef.current = aiConsent;
  }, [aiConsent]);

  // 1) Resolver las reglas del ejercicio
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const { data: ex } = await sb
        .from("exercises")
        .select("id, name, rule_key, pose_rules, rules_source, rules_reviewed")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      const displayName = ex?.name ?? name;
      setExerciseName(displayName);
      setExerciseId(ex?.id ?? null);
      const r = resolveRules({ name: displayName, rule_key: ex?.rule_key, pose_rules: ex?.pose_rules });
      if (r.rules) {
        setRules(r.rules);
        setOrigin(r.origin === "custom" ? (ex?.rules_source === "gemini" ? "gemini" : "custom") : (r.origin as Origin));
        setReviewed(ex?.rules_reviewed ?? true);
        setStage("setup");
        return;
      }
      // Ejercicio desconocido: pedimos reglas al servidor (Gemini, una sola vez por ejercicio).
      try {
        const res = await fetch("/api/exercises/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: displayName, exerciseId: ex?.id }),
        });
        const json = await res.json();
        if (cancelled) return;
        const parsed = json.rules ? safeParseRuleSet(json.rules) : null;
        if (res.ok && parsed?.success) {
          setRules(parsed.data);
          setOrigin(json.origin === "gemini" ? "gemini" : "curated");
          setReviewed(json.origin !== "gemini");
          if (json.exerciseId) setExerciseId(json.exerciseId);
        } else {
          setOrigin("auto");
          setNotice(json.error ?? "No hay reglas para este ejercicio: uso el modo automático.");
        }
      } catch {
        setOrigin("auto");
        setNotice("Sin conexión con el servidor: uso el modo automático.");
      }
      if (!cancelled) setStage("setup");
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, name]);

  const showCue = useCallback((text: string, severity: string) => {
    setCue({ text, severity });
    if (cueTimer.current) clearTimeout(cueTimer.current);
    cueTimer.current = setTimeout(() => setCue(null), 3500);
  }, []);

  const handleEvents = useCallback(
    (events: AnalyzerEvent[]) => {
      const speaker = speakerRef.current;
      for (const ev of events) {
        if (ev.type === "rep") {
          if (voiceRef.current) speaker?.say(String(ev.count), { interrupt: true });
        } else if (ev.type === "cue") {
          showCue(ev.message, ev.severity);
          if (voiceRef.current) speaker?.say(ev.message, { interrupt: ev.severity === "error" });
        } else if (ev.type === "partial") {
          showCue(ev.message, "warning");
          if (voiceRef.current) speaker?.say(ev.message);
        } else if (ev.type === "hold_tick") {
          if (voiceRef.current) speaker?.say(`${ev.seconds} segundos`);
        }
      }
    },
    [showCue],
  );

  const captureKeyframe = useCallback(() => {
    const video = videoRef.current;
    if (!video || !consentRef.current || keyframes.current.length >= 4) return;
    const c = document.createElement("canvas");
    const w = 384;
    c.width = w;
    c.height = Math.round((video.videoHeight / video.videoWidth) * w);
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    keyframes.current.push(c.toDataURL("image/jpeg", 0.7));
  }, []);

  const draw = useCallback((lm: Landmark[] | undefined, issues: ActiveIssue[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;
    const worst = issues.some((i) => i.severity === "error") ? "#ff5d5d" : issues.length ? "#f2b13d" : "#3ccf8e";
    ctx.lineWidth = Math.max(3, canvas.width / 220);
    ctx.strokeStyle = worst;
    ctx.lineCap = "round";
    for (const [a, b] of SKELETON) {
      const p = lm[a];
      const q = lm[b];
      if ((p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
      ctx.lineTo(q.x * canvas.width, q.y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffffff";
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const p = lm[i];
      if ((p.visibility ?? 1) < 0.4) continue;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, ctx.lineWidth * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const tick = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (video && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const lm = result.landmarks?.[0] as Landmark[] | undefined;
      const aspect = video.videoWidth / Math.max(1, video.videoHeight);

      if (!analyzerRef.current && calibratorRef.current) {
        const learned = calibratorRef.current.add(lm, now, aspect);
        if (learned) {
          analyzerRef.current = new FormAnalyzer(learned);
          setRules(learned);
          showCue("Listo, ya aprendí el movimiento", "info");
          if (voiceRef.current) speakerRef.current?.say("Listo, ya aprendí el movimiento. Contando.");
        } else if (now - lastHud.current > 150) {
          lastHud.current = now;
          setHud((h) => ({ ...h, status: lm ? "calibrating" : "no_person", calibration: calibratorRef.current!.progress(now) }));
        }
        draw(lm, []);
      } else if (analyzerRef.current) {
        const fr = analyzerRef.current.process(lm, now, aspect);
        handleEvents(fr.events);
        if (fr.status === "tracking") {
          if (keyframes.current.length === 0) captureKeyframe();
          if (fr.region === "end" && lastRegion.current !== "end" && keyframes.current.length < 3) captureKeyframe();
          lastRegion.current = fr.region;
        }
        if (now - lastHud.current > 100) {
          lastHud.current = now;
          setHud({
            status: fr.status,
            reps: fr.reps,
            partials: fr.partials,
            holdSeconds: fr.holdSeconds,
            issues: fr.activeIssues,
            calibration: 1,
            missing: fr.missingJoints.join(", "),
          });
        }
        draw(lm, fr.activeIssues);
      }
    }
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }, [captureKeyframe, draw, handleEvents, showCue]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const releaseCamera = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    speakerRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => {
      releaseCamera();
      landmarkerRef.current?.close();
    };
  }, [releaseCamera]);

  async function start() {
    setError(null);
    speakerRef.current ??= new Speaker();
    speakerRef.current.unlock();
    setStage("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      landmarkerRef.current ??= await createPoseLandmarker("lite");
    } catch (err) {
      releaseCamera();
      setStage("setup");
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /Permission|NotAllowed/i.test(msg)
          ? "Necesitamos permiso para usar la cámara. Habilitalo en la configuración del navegador."
          : `No se pudo iniciar la cámara o el modelo: ${msg}`,
      );
      return;
    }

    try {
      wakeLock.current = await navigator.wakeLock?.request("screen");
    } catch {
      /* no es crítico */
    }

    analyzerRef.current = rules ? new FormAnalyzer(rules) : null;
    calibratorRef.current = rules ? null : new AutoCalibrator(exerciseName);
    keyframes.current = [];
    lastRegion.current = null;

    // Cuenta regresiva para que el alumno se acomode
    for (const n of [3, 2, 1]) {
      setCountdown(n);
      if (voiceRef.current) speakerRef.current.say(String(n), { interrupt: true });
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);
    if (voiceRef.current) speakerRef.current.say(rules ? "¡Vamos!" : "Hacé dos repeticiones de prueba");
    setStage("running");
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }

  async function finish() {
    captureKeyframe();
    releaseCamera();
    setFrameCount(keyframes.current.length);
    const s = analyzerRef.current?.summary() ?? null;
    setSummary(s);
    setStage("summary");
    if (!s || !profile) return;
    const { data } = await createClient()
      .from("form_checks")
      .insert({
        student_id: profile.id,
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        program_exercise_id: programExerciseId ?? null,
        reps: s.reps,
        score: s.score,
        duration_s: s.durationS,
        issues: s.issues.map(({ id, label, message, count }) => ({ id, label, message, count })),
      })
      .select("id")
      .single();
    if (data?.id) setCheckId(data.id);
  }

  async function requestAiReview() {
    if (!summary) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/form-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          exerciseName,
          summary: { reps: summary.reps, score: summary.score, issues: summary.issues.map((i) => ({ label: i.label, count: i.count })) },
          frames: keyframes.current.slice(0, 4),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setAiReview(json.review);
      if (checkId) await createClient().from("form_checks").update({ ai_review: json.review }).eq("id", checkId);
    } catch (err) {
      setAiReview(`No se pudo obtener la devolución: ${err instanceof Error ? err.message : ""}`);
    } finally {
      setAiLoading(false);
    }
  }

  const mirrored = facingMode === "user";
  const originInfo = ORIGIN_LABEL[origin];

  return (
    <div className="relative min-h-dvh bg-black text-white">
      {/* Video + esqueleto (siempre montados para que la cámara arranque rápido) */}
      <div className={cn("absolute inset-0", stage === "running" || stage === "starting" ? "block" : "hidden")}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
          style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
        />
      </div>

      {stage === "loading" && (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-brand">
          <Spinner className="size-8" />
          <p className="text-sm text-white/70">Preparando el análisis de {name}…</p>
        </div>
      )}

      {stage === "setup" && (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
          <Link href="/tecnica" className="text-sm text-white/60">
            ← Volver
          </Link>
          <div>
            <h1 className="font-display text-4xl font-bold uppercase leading-none">{exerciseName}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={originInfo.tone}>{originInfo.text}</Badge>
              {origin === "gemini" && !reviewed && <Badge tone="warn">Sin revisar por el entrenador</Badge>}
            </div>
          </div>
          {notice && <p className="rounded-xl bg-warn/15 px-3 py-2 text-sm text-warn">{notice}</p>}

          <Card className="border-white/10 bg-white/5 text-white">
            <p className="text-xs uppercase tracking-wider text-white/50">Cómo ubicar el teléfono</p>
            <p className="mt-1">{rules?.setup_hint ?? "Apoyá el teléfono a 2-3 metros, que se vea todo tu cuerpo. Hacé 2 repeticiones de prueba para que la app aprenda el movimiento."}</p>
          </Card>

          {rules && rules.checks.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-white/50">Qué voy a mirar</p>
              <ul className="space-y-1 text-sm text-white/80">
                {rules.rep?.target_end_message && <li>• Recorrido completo</li>}
                {rules.checks.map((c) => (
                  <li key={c.id}>• {c.label}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setFacingMode(facingMode === "user" ? "environment" : "user")}
              className="rounded-xl border border-white/15 px-3 py-3 text-sm"
            >
              Cámara: {facingMode === "user" ? "frontal" : "trasera"}
            </button>
            <button onClick={() => setVoiceOn(!voiceOn)} className="rounded-xl border border-white/15 px-3 py-3 text-sm">
              Voz: {voiceOn ? "activada" : "apagada"}
            </button>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm text-white/80">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--brand)]" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
            <span>
              Al terminar, mandar 3-4 fotos de la serie a la IA (Gemini) para una devolución escrita.{" "}
              <span className="text-white/50">
                Opcional. El análisis en vivo siempre ocurre en tu teléfono y no se graba video. Si activás esto, Google
                puede usar esas imágenes para mejorar sus productos.
              </span>
            </span>
          </label>

          {error && <ErrorNote>{error}</ErrorNote>}
          <Button size="lg" className="mt-auto w-full" onClick={start}>
            Empezar
          </Button>
        </div>
      )}

      {(stage === "starting" || stage === "running") && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <div className="rounded-2xl bg-black/55 px-4 py-2 backdrop-blur">
              <p className="text-xs uppercase tracking-wider text-white/60">{rules?.mode === "hold" ? "Segundos" : "Reps"}</p>
              <p className="font-display text-6xl font-bold leading-none tabular-nums">
                {rules?.mode === "hold" ? hud.holdSeconds : hud.reps}
              </p>
              {hud.partials > 0 && <p className="text-xs text-warn">{hud.partials} incompletas</p>}
            </div>
            <button
              onClick={finish}
              className="pointer-events-auto rounded-2xl bg-brand px-5 py-3 font-semibold shadow-lg"
            >
              Terminar
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            {countdown !== null && <p className="font-display text-9xl font-bold drop-shadow-lg">{countdown}</p>}
            {stage === "starting" && countdown === null && (
              <p className="flex items-center gap-2 rounded-xl bg-black/60 px-4 py-2">
                <Spinner className="size-4" /> Cargando el modelo de pose…
              </p>
            )}
            {stage === "running" && hud.status === "no_person" && (
              <p className="rounded-xl bg-black/60 px-4 py-2">Ubicate frente a la cámara</p>
            )}
            {stage === "running" && hud.status === "not_visible" && (
              <p className="rounded-xl bg-black/60 px-4 py-2 text-center">Alejate un poco: necesito ver {hud.missing}</p>
            )}
            {stage === "running" && hud.status === "calibrating" && (
              <div className="w-64 rounded-xl bg-black/60 px-4 py-3 text-center">
                <p className="text-sm">Aprendiendo el movimiento… hacé 2 repeticiones</p>
                <div className="mt-2 h-1.5 rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(hud.calibration * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="min-h-20">
            {cue && (
              <p
                className={cn(
                  "mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-lg font-semibold shadow-xl",
                  cue.severity === "error" ? "bg-bad" : cue.severity === "warning" ? "bg-warn text-black" : "bg-black/70",
                )}
              >
                {cue.text}
              </p>
            )}
          </div>
        </div>
      )}

      {stage === "summary" && (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-bg px-5 py-6 text-text">
          <h1 className="font-display text-4xl font-bold uppercase leading-none">{exerciseName}</h1>
          {summary ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Card className="text-center">
                  <p className="text-xs text-muted">{rules?.mode === "hold" ? "Segundos" : "Reps"}</p>
                  <p className="font-display text-4xl font-bold">{rules?.mode === "hold" ? summary.holdSeconds : summary.reps}</p>
                </Card>
                <Card className="text-center">
                  <p className="text-xs text-muted">Técnica</p>
                  <p className={cn("font-display text-4xl font-bold", (summary.score ?? 0) >= 80 ? "text-ok" : (summary.score ?? 0) >= 60 ? "text-warn" : "text-bad")}>
                    {summary.score ?? "–"}
                  </p>
                </Card>
                <Card className="text-center">
                  <p className="text-xs text-muted">Incompletas</p>
                  <p className="font-display text-4xl font-bold">{summary.partials}</p>
                </Card>
              </div>

              {summary.repDetails.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {summary.repDetails.map((r) => (
                    <span
                      key={r.index}
                      title={r.issues.map((i) => i.label).join(", ") || "Sin errores"}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg text-sm font-bold",
                        r.score >= 85 ? "bg-ok/20 text-ok" : r.score >= 60 ? "bg-warn/20 text-warn" : "bg-bad/20 text-bad",
                      )}
                    >
                      {r.index}
                    </span>
                  ))}
                </div>
              )}

              <Card>
                <p className="mb-2 font-semibold">Para mejorar</p>
                {summary.issues.length === 0 ? (
                  <p className="text-sm text-ok">¡No detecté errores! Seguí así.</p>
                ) : (
                  <ul className="space-y-2">
                    {summary.issues.map((i) => (
                      <li key={i.id} className="text-sm">
                        <span className="font-semibold">{i.label}</span>{" "}
                        <span className="text-muted">({i.count} {i.count === 1 ? "vez" : "veces"})</span>
                        <br />
                        {i.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {aiConsent && frameCount > 0 && (
                <Card>
                  {aiReview ? (
                    <p className="whitespace-pre-line text-sm">{aiReview}</p>
                  ) : (
                    <Button variant="secondary" className="w-full" onClick={requestAiReview} loading={aiLoading}>
                      Pedir devolución a la IA
                    </Button>
                  )}
                </Card>
              )}
              <p className="text-xs text-muted">
                El detector es una ayuda, no reemplaza la mirada de tu entrenador. Si algo duele, pará y consultalo.
              </p>
            </>
          ) : (
            <p className="text-muted">No llegué a analizar repeticiones. Probá ubicar mejor el teléfono.</p>
          )}
          <div className="mt-auto flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStage("setup")}>
              Otra serie
            </Button>
            <Link href="/rutina" className="flex-1">
              <Button className="w-full">Volver a la rutina</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
