import { findRuleKeyByName, getCuratedRules } from "./library";
import { safeParseRuleSet, type RuleSet } from "./schema";

export interface ExerciseLike {
  name: string;
  rule_key?: string | null;
  pose_rules?: unknown;
}

export type RulesOrigin = "custom" | "curated" | "alias" | "none";

/**
 * Orden de prioridad para elegir las reglas de un ejercicio:
 * 1. pose_rules propias del ejercicio (editadas por el coach o generadas por Gemini)
 * 2. rule_key explícita apuntando a la biblioteca curada
 * 3. coincidencia por nombre con los alias de la biblioteca
 * 4. ninguna → la UI ofrece generar con Gemini o usar el modo automático
 */
export function resolveRules(ex: ExerciseLike): { rules: RuleSet | null; origin: RulesOrigin } {
  if (ex.pose_rules) {
    const parsed = safeParseRuleSet(ex.pose_rules);
    if (parsed.success) return { rules: parsed.data, origin: "custom" };
  }
  const byKey = getCuratedRules(ex.rule_key);
  if (byKey) return { rules: byKey, origin: "curated" };
  const alias = getCuratedRules(findRuleKeyByName(ex.name));
  if (alias) return { rules: alias, origin: "alias" };
  return { rules: null, origin: "none" };
}
