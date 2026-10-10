import type { RepConfig } from "./schema";

export type Region = "start" | "moving" | "end";

export interface RepResult {
  index: number;
  durationMs: number;
  /** Valor más extremo alcanzado en la zona "end" (ej. ángulo mínimo de rodilla). */
  endExtreme: number;
  /** Valor más extremo en la zona "start" asociado a esta rep (ej. extensión arriba). */
  startExtreme: number;
  eccentricMs: number;
  concentricMs: number;
  endOk: boolean;
  startOk: boolean;
  tempoOk: boolean;
}

export type RepEvent =
  | { type: "rep"; rep: RepResult }
  | { type: "partial"; reached: number };

/**
 * Contador de repeticiones con histéresis.
 *
 * Internamente normaliza todo para que "start" sea siempre el valor alto:
 * si la métrica sube al hacer el movimiento (ej. press: el codo se extiende),
 * se trabaja con el valor negado. Un ciclo completo es casa → afuera → casa,
 * donde "casa" es la zona start (o la zona end si starts_at_end = true).
 */
export class RepCounter {
  private readonly dec: boolean;
  private readonly S: number;
  private readonly E: number;
  private readonly TE?: number;
  private readonly TS?: number;
  private readonly hysteresis: number;

  private state: "waiting" | "home" | "out" = "waiting";
  private count = 0;
  private repStart = 0;
  private homePeak = NaN;
  private awayExtreme = NaN;
  private awayExtremeT = 0;
  private reachedAway = false;
  private lastRegion: Region = "moving";

  constructor(private cfg: RepConfig) {
    this.dec = cfg.start > cfg.end;
    const n = (v: number) => (this.dec ? v : -v);
    this.S = n(cfg.start);
    this.E = n(cfg.end);
    this.TE = cfg.target_end === undefined ? undefined : n(cfg.target_end);
    this.TS = cfg.target_start === undefined ? undefined : n(cfg.target_start);
    this.hysteresis = Math.max(1e-6, Math.abs(this.S - this.E) * 0.05);
  }

  get reps(): number {
    return this.count;
  }

  get region(): Region {
    return this.lastRegion;
  }

  private norm(v: number): number {
    return this.dec ? v : -v;
  }

  private denorm(v: number): number {
    return this.dec ? v : -v;
  }

  private regionOf(v: number): Region {
    if (v >= this.S) return "start";
    if (v <= this.E) return "end";
    return "moving";
  }

  private inHome(v: number, entering: boolean): boolean {
    const h = entering ? 0 : this.hysteresis;
    return this.cfg.starts_at_end ? v <= this.E + h : v >= this.S - h;
  }

  private inAway(v: number): boolean {
    return this.cfg.starts_at_end ? v >= this.S : v <= this.E;
  }

  /** Más extremo hacia la zona "afuera". */
  private moreAway(a: number, b: number): boolean {
    return this.cfg.starts_at_end ? a > b : a < b;
  }

  /** Más extremo hacia la zona "casa". */
  private moreHome(a: number, b: number): boolean {
    return this.cfg.starts_at_end ? a < b : a > b;
  }

  update(raw: number, tMs: number): RepEvent | null {
    const v = this.norm(raw);
    this.lastRegion = this.regionOf(v);

    switch (this.state) {
      case "waiting":
        if (this.inHome(v, true)) {
          this.state = "home";
          this.homePeak = v;
        }
        return null;

      case "home":
        if (this.inHome(v, false)) {
          if (Number.isNaN(this.homePeak) || this.moreHome(v, this.homePeak)) this.homePeak = v;
          return null;
        }
        // salió de la zona de casa: empieza una repetición
        this.state = "out";
        this.repStart = tMs;
        this.awayExtreme = v;
        this.awayExtremeT = tMs;
        this.reachedAway = this.inAway(v);
        return null;

      case "out": {
        if (this.moreAway(v, this.awayExtreme)) {
          this.awayExtreme = v;
          this.awayExtremeT = tMs;
        }
        if (this.inAway(v)) this.reachedAway = true;
        if (!this.inHome(v, true)) return null;

        // volvió a casa
        const duration = tMs - this.repStart;
        const event = this.reachedAway && duration >= this.cfg.min_rep_ms ? this.finishRep(tMs) : this.partial();
        this.state = "home";
        this.homePeak = v;
        return event;
      }
    }
  }

  private partial(): RepEvent | null {
    const travel = Math.abs(this.awayExtreme - (this.cfg.starts_at_end ? this.E : this.S));
    const full = Math.abs(this.S - this.E);
    // Solo avisamos si se movió al menos un 40% del recorrido (si no, es ruido).
    if (travel >= full * 0.4) return { type: "partial", reached: this.denorm(this.awayExtreme) };
    return null;
  }

  private finishRep(tMs: number): RepEvent {
    this.count += 1;
    const atStartIsHome = !this.cfg.starts_at_end;
    const endExtremeN = atStartIsHome ? this.awayExtreme : this.homePeak;
    const startExtremeN = atStartIsHome ? this.homePeak : this.awayExtreme;
    const phase1 = this.awayExtremeT - this.repStart; // casa → giro
    const phase2 = tMs - this.awayExtremeT; // giro → casa
    // phase1 va hacia "end" si la casa es "start".
    const toEndMs = atStartIsHome ? phase1 : phase2;
    const toStartMs = atStartIsHome ? phase2 : phase1;
    const eccentricMs = this.cfg.eccentric_phase === "to_start" ? toStartMs : toEndMs;
    const concentricMs = this.cfg.eccentric_phase === "to_start" ? toEndMs : toStartMs;

    const rep: RepResult = {
      index: this.count,
      durationMs: tMs - this.repStart,
      endExtreme: this.denorm(endExtremeN),
      startExtreme: this.denorm(startExtremeN),
      eccentricMs,
      concentricMs,
      endOk: this.TE === undefined || endExtremeN <= this.TE,
      startOk: this.TS === undefined || Number.isNaN(startExtremeN) || startExtremeN >= this.TS,
      tempoOk: this.cfg.min_eccentric_ms === undefined || eccentricMs >= this.cfg.min_eccentric_ms,
    };
    return { type: "rep", rep };
  }

  reset(): void {
    this.state = "waiting";
    this.count = 0;
    this.homePeak = NaN;
    this.awayExtreme = NaN;
    this.reachedAway = false;
  }
}
