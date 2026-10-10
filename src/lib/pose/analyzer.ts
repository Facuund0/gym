import { LandmarkSmoother } from "./filters";
import { jointOf, resolvePoint, visibleSide, type Joint, type Landmark, type Side } from "./landmarks";
import { estimateFacing, evaluateMetric, type MetricContext } from "./metrics";
import { RepCounter, type Region, type RepResult } from "./repCounter";
import type { Check, RuleSet } from "./schema";

export type Severity = "info" | "warning" | "error";

export interface ActiveIssue {
  id: string;
  label: string;
  message: string;
  severity: Severity;
}

export interface RepSummary extends RepResult {
  score: number;
  issues: ActiveIssue[];
}

export type AnalyzerEvent =
  | { type: "rep"; count: number; score: number; issues: ActiveIssue[] }
  | { type: "partial"; message: string }
  | { type: "cue"; message: string; severity: Severity }
  | { type: "hold_tick"; seconds: number };

export interface FrameResult {
  status: "no_person" | "not_visible" | "tracking";
  side: Side;
  region: Region | null;
  reps: number;
  partials: number;
  holdSeconds: number;
  primary: number | null;
  activeIssues: ActiveIssue[];
  events: AnalyzerEvent[];
  missingJoints: Joint[];
}

export interface SessionSummary {
  reps: number;
  partials: number;
  score: number | null;
  durationS: number;
  holdSeconds: number;
  issues: Array<{ id: string; label: string; message: string; severity: Severity; count: number }>;
  repDetails: RepSummary[];
}

const PENALTY: Record<Severity, number> = { info: 5, warning: 15, error: 30 };
const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };
const MIN_VISIBILITY = 0.5;
const CHECK_MIN_VISIBILITY = 0.35;

export const JOINT_LABEL_ES: Record<Joint, string> = {
  nose: "la cabeza",
  ear: "la cabeza",
  shoulder: "los hombros",
  elbow: "los codos",
  wrist: "las muñecas",
  hip: "la cadera",
  knee: "las rodillas",
  ankle: "los tobillos",
  heel: "los talones",
  foot: "los pies",
};

/** Evita repetir la misma consigna una y otra vez. */
class CueGate {
  private lastAny = -Infinity;
  private lastByKey = new Map<string, number>();
  constructor(private globalMs = 2500, private perKeyMs = 7000) {}
  allow(key: string, t: number, urgent = false): boolean {
    const lastKey = this.lastByKey.get(key) ?? -Infinity;
    if (t - lastKey < this.perKeyMs) return false;
    if (!urgent && t - this.lastAny < this.globalMs) return false;
    this.lastAny = t;
    this.lastByKey.set(key, t);
    return true;
  }
}

interface CheckState {
  violatingSince: number | null;
  active: boolean;
  repMin: number;
  repMax: number;
}

/**
 * Analiza la técnica cuadro por cuadro a partir de un RuleSet.
 * No sabe nada de cámaras ni de React: recibe landmarks y devuelve resultados,
 * así se puede testear con datos sintéticos (ver tests/pose.test.ts).
 */
export class FormAnalyzer {
  private smoother = new LandmarkSmoother();
  private counter: RepCounter | null;
  private side: Side;
  private sideVotes = 0;
  private facing: 1 | -1 = 1;
  private facingScore = 0;
  private checkStates = new Map<string, CheckState>();
  private repIssues = new Map<string, ActiveIssue>();
  private reps: RepSummary[] = [];
  private partials = 0;
  private holdMs = 0;
  private lastT: number | null = null;
  private firstT: number | null = null;
  private notVisibleSince: number | null = null;
  private lastHoldTick = 0;
  private cleanStreak = 0;
  private cues = new CueGate();
  private requiredJoints: Joint[];

  constructor(public readonly rules: RuleSet) {
    this.counter = rules.mode === "reps" && rules.rep ? new RepCounter(rules.rep) : null;
    this.side = rules.side === "right" ? "right" : "left";
    this.requiredJoints = Array.from(
      new Set(rules.required.map((r) => jointOf(r)).filter((j): j is Joint => j !== null)),
    );
    for (const c of rules.checks) {
      this.checkStates.set(c.id, { violatingSince: null, active: false, repMin: Infinity, repMax: -Infinity });
    }
  }

  process(rawLandmarks: Landmark[] | undefined, tMs: number, aspect: number): FrameResult {
    const events: AnalyzerEvent[] = [];
    const dt = this.lastT === null ? 0 : Math.min(200, tMs - this.lastT);
    this.lastT = tMs;
    if (this.firstT === null) this.firstT = tMs;

    const base = (status: FrameResult["status"], missing: Joint[] = []): FrameResult => ({
      status,
      side: this.side,
      region: this.counter?.region ?? null,
      reps: this.counter?.reps ?? 0,
      partials: this.partials,
      holdSeconds: Math.floor(this.holdMs / 1000),
      primary: null,
      activeIssues: [],
      events,
      missingJoints: missing,
    });

    if (!rawLandmarks || rawLandmarks.length < 33) {
      return base("no_person");
    }

    const landmarks = this.smoother.smooth(rawLandmarks, tMs);

    // Lado: con histéresis para que no salte entre izquierda y derecha.
    if (this.rules.side === "auto") {
      const best = visibleSide(landmarks, this.requiredJoints);
      if (best !== this.side) {
        this.sideVotes += 1;
        if (this.sideVotes > 15) {
          this.side = best;
          this.sideVotes = 0;
        }
      } else {
        this.sideVotes = 0;
      }
    }

    const fs = estimateFacing(landmarks, this.side, aspect);
    this.facingScore = this.facingScore * 0.9 + fs * 0.1;
    this.facing = this.facingScore >= 0 ? 1 : -1;

    const ctx: MetricContext = { landmarks, side: this.side, aspect, facing: this.facing };

    // ¿Se ven las articulaciones necesarias?
    const missing = this.missingJoints(ctx);
    if (missing.length > 0) {
      if (this.notVisibleSince === null) this.notVisibleSince = tMs;
      if (tMs - this.notVisibleSince > 600) {
        const msg = `Acomodá el teléfono: no veo ${JOINT_LABEL_ES[missing[0]]}`;
        if (this.cues.allow("setup", tMs)) events.push({ type: "cue", message: msg, severity: "info" });
        return base("not_visible", missing);
      }
    } else {
      this.notVisibleSince = null;
    }

    // Métrica principal y conteo
    let primary: number | null = null;
    if (this.counter && this.rules.rep) {
      const mv = evaluateMetric(this.rules.rep.metric, ctx);
      if (mv) {
        primary = mv.value;
        const ev = this.counter.update(mv.value, tMs);
        if (ev?.type === "rep") this.onRep(ev.rep, tMs, events);
        if (ev?.type === "partial") {
          this.partials += 1;
          this.repIssues.clear();
          this.resetRepRanges();
          const msg = this.rules.rep.target_end_message ?? "Hacé el recorrido completo";
          if (this.cues.allow("partial", tMs, true)) events.push({ type: "partial", message: msg });
        }
      }
    }
    const region = this.counter?.region ?? null;

    // Chequeos por cuadro
    const active: ActiveIssue[] = [];
    for (const check of this.rules.checks) {
      const st = this.checkStates.get(check.id)!;
      const mv = evaluateMetric(check.metric, ctx);
      if (!mv || mv.visibility < CHECK_MIN_VISIBILITY) {
        st.violatingSince = null;
        st.active = false;
        continue;
      }
      st.repMin = Math.min(st.repMin, mv.value);
      st.repMax = Math.max(st.repMax, mv.value);
      if (check.min === undefined && check.max === undefined) continue; // solo max_range

      const inPhase = this.phaseMatches(check, region);
      const bad =
        inPhase &&
        ((check.min !== undefined && mv.value < check.min) || (check.max !== undefined && mv.value > check.max));
      if (bad) {
        if (st.violatingSince === null) st.violatingSince = tMs;
        if (tMs - st.violatingSince >= check.hold_ms) {
          const issue = this.issueOf(check);
          if (!st.active && check.severity !== "info" && this.cues.allow(check.id, tMs, check.severity === "error")) {
            events.push({ type: "cue", message: check.message, severity: check.severity });
          }
          st.active = true;
          active.push(issue);
          this.repIssues.set(check.id, issue);
        }
      } else {
        st.violatingSince = null;
        st.active = false;
      }
    }

    // Isométricos (plancha): suma tiempo solo si no hay errores graves activos.
    if (this.rules.mode === "hold") {
      if (!active.some((i) => i.severity === "error")) this.holdMs += dt;
      const secs = Math.floor(this.holdMs / 1000);
      if (secs > 0 && secs % 10 === 0 && secs !== this.lastHoldTick) {
        this.lastHoldTick = secs;
        events.push({ type: "hold_tick", seconds: secs });
      }
    }

    return {
      ...base("tracking"),
      region,
      primary,
      activeIssues: active,
      events,
      reps: this.counter?.reps ?? 0,
      holdSeconds: Math.floor(this.holdMs / 1000),
    };
  }

  private missingJoints(ctx: MetricContext): Joint[] {
    const out: Joint[] = [];
    for (const ref of this.rules.required) {
      const j = jointOf(ref);
      if (!j) continue;
      const p = resolvePoint(ref, ctx.landmarks, ctx.side, ctx.aspect);
      const offFrame = p !== null && (p.y < -0.05 || p.y > 1.05);
      if ((!p || p.visibility < MIN_VISIBILITY || offFrame) && !out.includes(j)) out.push(j);
    }
    return out;
  }

  private phaseMatches(check: Check, region: Region | null): boolean {
    if (check.phase === "any" || region === null) return true;
    return check.phase === region;
  }

  private issueOf(check: Check): ActiveIssue {
    return { id: check.id, label: check.label, message: check.message, severity: check.severity };
  }

  private resetRepRanges(): void {
    for (const st of this.checkStates.values()) {
      st.repMin = Infinity;
      st.repMax = -Infinity;
    }
  }

  private onRep(rep: RepResult, tMs: number, events: AnalyzerEvent[]): void {
    const cfg = this.rules.rep!;
    if (!rep.endOk) {
      this.repIssues.set("target_end", {
        id: "target_end",
        label: "Recorrido",
        message: cfg.target_end_message ?? "Hacé el recorrido completo",
        severity: "warning",
      });
    }
    if (!rep.startOk) {
      this.repIssues.set("target_start", {
        id: "target_start",
        label: "Extensión",
        message: cfg.target_start_message ?? "Terminá de extender en la posición inicial",
        severity: "info",
      });
    }
    if (!rep.tempoOk) {
      this.repIssues.set("tempo", {
        id: "tempo",
        label: "Tempo",
        message: cfg.tempo_message ?? "Controlá la bajada",
        severity: "info",
      });
    }
    for (const check of this.rules.checks) {
      if (check.max_range === undefined) continue;
      const st = this.checkStates.get(check.id)!;
      if (st.repMax - st.repMin > check.max_range) this.repIssues.set(check.id, this.issueOf(check));
    }

    const issues = Array.from(this.repIssues.values());
    const score = Math.max(0, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0));
    this.reps.push({ ...rep, score, issues });
    events.push({ type: "rep", count: rep.index, score, issues });

    const worst = issues.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    if (worst) {
      this.cleanStreak = 0;
      if (this.cues.allow(worst.id, tMs)) events.push({ type: "cue", message: worst.message, severity: worst.severity });
    } else {
      this.cleanStreak += 1;
      if (this.cleanStreak % 3 === 0 && this.cues.allow("praise", tMs)) {
        events.push({ type: "cue", message: "¡Muy bien, seguí así!", severity: "info" });
      }
    }
    this.repIssues.clear();
    this.resetRepRanges();
  }

  summary(): SessionSummary {
    const counts = new Map<string, SessionSummary["issues"][number]>();
    for (const r of this.reps) {
      for (const i of r.issues) {
        const prev = counts.get(i.id);
        if (prev) prev.count += 1;
        else counts.set(i.id, { ...i, count: 1 });
      }
    }
    const scores = this.reps.map((r) => r.score);
    return {
      reps: this.reps.length,
      partials: this.partials,
      score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      durationS: this.firstT === null || this.lastT === null ? 0 : Math.round((this.lastT - this.firstT) / 1000),
      holdSeconds: Math.floor(this.holdMs / 1000),
      issues: Array.from(counts.values()).sort((a, b) => b.count - a.count),
      repDetails: this.reps,
    };
  }

  reset(): void {
    this.counter?.reset();
    this.smoother.reset();
    this.reps = [];
    this.partials = 0;
    this.holdMs = 0;
    this.firstT = null;
    this.lastT = null;
    this.repIssues.clear();
    this.resetRepRanges();
  }
}
