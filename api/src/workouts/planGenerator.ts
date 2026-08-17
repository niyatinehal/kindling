import type { Profile } from "../../generated/prisma/client.js";
import { generatePlan } from "./generatePlan.js";
import type { PlanDraft } from "./generatePlan.js";

/**
 * The seam PRD §16.4 asks for: "Model provider is abstracted behind an internal
 * interface so the underlying LLM can be swapped without touching calling code."
 *
 * Today there is exactly one implementation and it uses no model at all. That is
 * the point — the deterministic engine is not a placeholder for an LLM, it is the
 * free, testable, latency-free default, and §16.1's rule-based safety filter has
 * to exist either way. An LLM adapter, when there is a budget for one, becomes a
 * second implementation of this type: it proposes movements and the same
 * contraindication table disposes of the unsafe ones.
 *
 * The type is deliberately narrow — a profile in, a draft out, no transport and
 * no persistence — so a future adapter cannot quietly grow a dependency on the
 * database or the request.
 */
export type PlanGenerator = {
  readonly name: string;
  generate: (profile: Profile, now: Date) => Promise<PlanDraft>;
};

export const rulesPlanGenerator: PlanGenerator = {
  name: "rules",
  generate: (profile, now) => Promise.resolve(generatePlan(profile, now)),
};

/**
 * Resolves the configured engine. `rules` is the only one that exists, so an
 * unknown value is a boot-time error rather than a silent fallback: a typo in
 * `WORKOUT_ENGINE` must not quietly downgrade a deployment that meant to run
 * something else.
 */
export function createPlanGenerator(engine: string): PlanGenerator {
  if (engine === "rules") {
    return rulesPlanGenerator;
  }
  throw new Error(`Unknown WORKOUT_ENGINE: ${engine}. Supported engines: rules`);
}
