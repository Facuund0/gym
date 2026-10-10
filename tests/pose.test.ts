import { describe, expect, it } from "vitest";
import { angleAt, inclination, lineOffset } from "@/lib/pose/geometry";
import { FormAnalyzer } from "@/lib/pose/analyzer";
import { CURATED_RULES, findRuleKeyByName } from "@/lib/pose/library";
import { RepCounter } from "@/lib/pose/repCounter";
import { parseRuleSet, safeParseRuleSet } from "@/lib/pose/schema";
import { resolveRules } from "@/lib/pose/resolve";
import { AutoCalibrator } from "@/lib/pose/auto";
import { cycle, sideFigure } from "./helpers/synthetic";

const FPS = 30;

function run(analyzer: FormAnalyzer, frames: ReturnType<typeof sideFigure>[]) {
  const events = [];
  let t = 0;
  for (const f of frames) {
    const r = analyzer.process(f, t, 1);
    events.push(...r.events);
    t += 1000 / FPS;
  }
  return events;
}

describe("geometría", () => {
  it("calcula ángulos internos", () => {
    const v = (x: number, y: number) => ({ x, y, visibility: 1 });
    expect(angleAt(v(0, 0), v(0, 1), v(1, 1))).toBeCloseTo(90);
    expect(angleAt(v(0, 0), v(0, 1), v(0, 2))).toBeCloseTo(180);
  });

  it("inclinación respecto de la vertical", () => {
    const v = (x: number, y: number) => ({ x, y, visibility: 1 });
    expect(inclination(v(0, 1), v(0, 0))).toBeCloseTo(0); // hacia arriba
    expect(inclination(v(0, 0), v(1, 0))).toBeCloseTo(90); // horizontal
    expect(inclination(v(0, 0), v(0, 1))).toBeCloseTo(180); // hacia abajo
  });

  it("offset respecto de una línea (cadera caída negativa)", () => {
    const v = (x: number, y: number) => ({ x, y, visibility: 1 });
    expect(lineOffset(v(0, 0.5), v(0.5, 0.6), v(1, 0.5))).toBeLessThan(0); // debajo
    expect(lineOffset(v(0, 0.5), v(0.5, 0.4), v(1, 0.5))).toBeGreaterThan(0); // arriba
  });
});

describe("biblioteca curada", () => {
  it("todas las reglas validan contra el esquema", () => {
    expect(Object.keys(CURATED_RULES).length).toBeGreaterThanOrEqual(12);
    for (const r of Object.values(CURATED_RULES)) expect(safeParseRuleSet(r).success).toBe(true);
  });

  it("resuelve nombres en castellano con el alias más específico", () => {
    expect(findRuleKeyByName("Sentadilla con barra")).toBe("squat");
    expect(findRuleKeyByName("Sentadilla búlgara")).toBe("lunge");
    expect(findRuleKeyByName("Peso muerto rumano")).toBe("hinge");
    expect(findRuleKeyByName("Peso muerto convencional")).toBe("deadlift");
    expect(findRuleKeyByName("Curl martillo")).toBe("biceps_curl");
    expect(findRuleKeyByName("Press militar con barra")).toBe("overhead_press");
    expect(findRuleKeyByName("Vuelos laterales")).toBe("lateral_raise");
    expect(findRuleKeyByName("Abducción en máquina")).toBeNull();
  });

  it("prioriza reglas propias válidas por sobre la biblioteca", () => {
    const custom = { ...CURATED_RULES.squat, key: "mi_sentadilla" };
    expect(resolveRules({ name: "Sentadilla", pose_rules: custom }).origin).toBe("custom");
    expect(resolveRules({ name: "Sentadilla", pose_rules: { roto: true } }).origin).toBe("alias");
    expect(resolveRules({ name: "Algo raro", rule_key: "plank" }).origin).toBe("curated");
  });

  it("rechaza reglas incoherentes", () => {
    const bad = { ...CURATED_RULES.squat, rep: { ...CURATED_RULES.squat.rep!, target_end: 130 } };
    expect(safeParseRuleSet(bad).success).toBe(false);
  });
});

describe("contador de repeticiones", () => {
  it("cuenta ciclos completos que bajan", () => {
    const c = new RepCounter(CURATED_RULES.squat.rep!);
    let reps = 0;
    cycle(175, 90, 5).forEach((v, i) => {
      const ev = c.update(v, (i * 1000) / FPS);
      if (ev?.type === "rep") reps++;
    });
    expect(reps).toBe(5);
  });

  it("cuenta ciclos que suben (press) y arranca abajo", () => {
    const c = new RepCounter(CURATED_RULES.overhead_press.rep!);
    let reps = 0;
    // press: valor sube de 0.1 (rack) a 0.95 (arriba)
    cycle(0.1, 0.95, 4).forEach((v, i) => {
      const ev = c.update(v, (i * 1000) / FPS);
      if (ev?.type === "rep") reps++;
    });
    expect(reps).toBe(4);
  });

  it("detecta repeticiones parciales sin contarlas", () => {
    const c = new RepCounter(CURATED_RULES.squat.rep!);
    const types: string[] = [];
    cycle(175, 135, 3).forEach((v, i) => {
      const ev = c.update(v, (i * 1000) / FPS);
      if (ev) types.push(ev.type);
    });
    expect(types).toEqual(["partial", "partial", "partial"]);
    expect(c.reps).toBe(0);
  });

  it("peso muerto: arranca desde el piso", () => {
    const c = new RepCounter(CURATED_RULES.deadlift.rep!);
    let reps = 0;
    cycle(80, 175, 3).forEach((v, i) => {
      const ev = c.update(v, (i * 1000) / FPS);
      if (ev?.type === "rep") reps++;
    });
    expect(reps).toBe(3);
  });
});

describe("analizador de sentadilla", () => {
  it("cuenta repeticiones limpias sin problemas", () => {
    const a = new FormAnalyzer(CURATED_RULES.squat);
    const frames = cycle(176, 92, 5, 90).map((k) => sideFigure({ kneeAngle: k, torsoLean: 25 }));
    const events = run(a, frames);
    const reps = events.filter((e) => e.type === "rep");
    expect(reps).toHaveLength(5);
    const s = a.summary();
    expect(s.reps).toBe(5);
    expect(s.issues.find((i) => i.id === "target_end")).toBeUndefined();
    expect(s.issues.find((i) => i.id === "torso_lean")).toBeUndefined();
  });

  it("marca falta de profundidad", () => {
    const a = new FormAnalyzer(CURATED_RULES.squat);
    const frames = cycle(176, 112, 3, 90).map((k) => sideFigure({ kneeAngle: k, torsoLean: 25 }));
    run(a, frames);
    const s = a.summary();
    expect(s.reps).toBe(3);
    expect(s.issues.find((i) => i.id === "target_end")?.count).toBe(3);
    expect(s.score).toBeLessThan(100);
  });

  it("marca torso demasiado inclinado abajo", () => {
    const a = new FormAnalyzer(CURATED_RULES.squat);
    const values = cycle(176, 92, 3, 90);
    const frames = values.map((k) => sideFigure({ kneeAngle: k, torsoLean: k < 125 ? 65 : 25 }));
    const events = run(a, frames);
    expect(events.some((e) => e.type === "cue" && e.message.startsWith("Pecho arriba"))).toBe(true);
    expect(a.summary().issues.find((i) => i.id === "torso_lean")).toBeDefined();
  });

  it("pide acomodar la cámara si no ve las articulaciones", () => {
    const a = new FormAnalyzer(CURATED_RULES.squat);
    const hidden = sideFigure({ kneeAngle: 170 }).map((l, i) => (i >= 25 ? { ...l, visibility: 0.1 } : l));
    let last;
    for (let i = 0; i < 40; i++) last = a.process(hidden, (i * 1000) / FPS, 1);
    expect(last!.status).toBe("not_visible");
    expect(last!.missingJoints).toContain("knee");
  });
});

describe("modo automático", () => {
  it("aprende el movimiento y genera un contador válido", () => {
    const cal = new AutoCalibrator("Ejercicio nuevo");
    let rules = null;
    let t = 0;
    for (const k of cycle(175, 95, 3, 60)) {
      rules = cal.add(sideFigure({ kneeAngle: k }), t, 1) ?? rules;
      t += 1000 / FPS;
      if (rules) break;
    }
    expect(rules).not.toBeNull();
    expect(rules!.key).toBe("auto_knee");
    expect(() => parseRuleSet(rules)).not.toThrow();
  });
});
