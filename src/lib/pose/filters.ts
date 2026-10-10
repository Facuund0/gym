import type { Landmark } from "./landmarks";

/**
 * Filtro One Euro (Casiez et al., 2012): suaviza mucho cuando el punto está
 * quieto (saca el temblor de la detección) y poco cuando se mueve rápido
 * (no agrega retraso). Es el estándar para landmarks en tiempo real.
 */
class LowPass {
  private y: number | undefined;
  filter(x: number, alpha: number): number {
    this.y = this.y === undefined ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  last(): number | undefined {
    return this.y;
  }
}

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | undefined;

  constructor(
    private minCutoff = 1.2,
    private beta = 0.4,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, tMs: number): number {
    if (this.lastT === undefined) {
      this.lastT = tMs;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, (tMs - this.lastT) / 1000);
    this.lastT = tMs;
    const prev = this.x.last() ?? value;
    const d = (value - prev) / dt;
    const ed = this.dx.filter(d, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(value, this.alpha(cutoff, dt));
  }
}

/** Aplica One Euro a x e y de cada landmark. */
export class LandmarkSmoother {
  private filters: Array<[OneEuroFilter, OneEuroFilter]> = [];

  constructor(private minCutoff = 1.2, private beta = 0.4) {}

  smooth(landmarks: Landmark[], tMs: number): Landmark[] {
    return landmarks.map((l, i) => {
      if (!this.filters[i]) {
        this.filters[i] = [new OneEuroFilter(this.minCutoff, this.beta), new OneEuroFilter(this.minCutoff, this.beta)];
      }
      const [fx, fy] = this.filters[i];
      return { ...l, x: fx.filter(l.x, tMs), y: fy.filter(l.y, tMs) };
    });
  }

  reset(): void {
    this.filters = [];
  }
}
