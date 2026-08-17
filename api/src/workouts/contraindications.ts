import type { Injury, MedicalCondition } from "../../generated/prisma/enums.js";
import type { ExerciseTag } from "./exerciseLibrary.js";

/**
 * The contraindication table (PRD §16.1) — product-owned, versioned, reviewable.
 *
 * ⚠️ THIS IS NOT MEDICAL AUTHORITY. It encodes conservative, widely-published
 * exercise-avoidance guidance so that a plan errs toward leaving a movement out.
 * It has NOT been reviewed by a clinician, and it must be before real users rely
 * on it. Every screen that shows a plan carries the "not medical advice"
 * disclaimer for the same reason.
 *
 * Two deliberate design choices:
 *
 * Rules name TAGS, never exercise keys. A new exercise inherits every exclusion
 * that applies to its mechanics the moment it is tagged, so adding a movement
 * cannot silently bypass a rule that was written before it existed.
 *
 * Over-exclusion is the intended failure mode. A user offered too few movements
 * is mildly disappointed; a user offered one that hurts them is the failure this
 * table exists to prevent. Where guidance is ambiguous, the tag is excluded.
 *
 * A flag mapping to an empty list is a real, deliberate answer: type 2 diabetes
 * and a thyroid condition change how a plan should be *paced and monitored*, not
 * which movements are mechanically unsafe, so they exclude nothing here rather
 * than being given invented exclusions to look thorough.
 */

const INJURY_EXCLUSIONS: Record<Injury, readonly ExerciseTag[]> = {
  knee: ["high_impact", "deep_knee_flexion"],
  lower_back: ["spinal_loading", "spinal_flexion", "high_impact"],
  shoulder: ["overhead_press", "wrist_loading"],
  neck: ["overhead_press", "inverted", "spinal_flexion"],
  wrist: ["wrist_loading"],
  ankle: ["high_impact", "balance_demand"],
  hip: ["deep_knee_flexion", "high_impact"],
};

const CONDITION_EXCLUSIONS: Record<MedicalCondition, readonly ExerciseTag[]> = {
  // Straining against a closed airway spikes blood pressure, and inverting the
  // torso raises it further.
  hypertension: ["breath_hold", "inverted", "high_intensity"],
  heart_condition: ["breath_hold", "high_intensity", "inverted"],
  // Sustained maximal effort is the trigger to avoid; steady work is the point.
  asthma: ["high_intensity"],
  arthritis: ["high_impact", "deep_knee_flexion"],
  // Loaded spinal flexion is the classic fracture mechanism in low bone density.
  osteoporosis: ["spinal_flexion", "spinal_loading", "high_impact"],
  // Supine work after the first trimester and anything with a fall risk.
  pregnancy: ["supine_flat", "prone", "high_impact", "breath_hold", "inverted", "balance_demand"],
  // Pacing and glucose monitoring, not a mechanical restriction.
  type_2_diabetes: [],
  thyroid_disorder: [],
};

/**
 * Everything the caller must not be shown, given what they declared.
 *
 * A Set because the caller's question is only ever "is this tag excluded?", and
 * because injuries and conditions overlap heavily — knee arthritis reaches this
 * function as both `knee` and `arthritis`, and each contributes the same tags.
 */
export function excludedTagsFor(input: {
  injuries: readonly Injury[];
  conditions: readonly MedicalCondition[];
}): ReadonlySet<ExerciseTag> {
  const excluded = new Set<ExerciseTag>();

  for (const injury of input.injuries) {
    for (const tag of INJURY_EXCLUSIONS[injury]) {
      excluded.add(tag);
    }
  }
  for (const condition of input.conditions) {
    for (const tag of CONDITION_EXCLUSIONS[condition]) {
      excluded.add(tag);
    }
  }

  return excluded;
}

/**
 * The reason a movement was left out, for the "low-impact: knee condition"
 * rationale PRD §10.2 shows next to a plan. Returns every matching flag rather
 * than the first, because "we left out jumping" is more trustworthy when it can
 * name both the knee and the arthritis.
 */
export function flagsExcluding(
  tag: ExerciseTag,
  input: { injuries: readonly Injury[]; conditions: readonly MedicalCondition[] },
): string[] {
  const reasons: string[] = [];

  for (const injury of input.injuries) {
    if (INJURY_EXCLUSIONS[injury].includes(tag)) {
      reasons.push(injury);
    }
  }
  for (const condition of input.conditions) {
    if (CONDITION_EXCLUSIONS[condition].includes(tag)) {
      reasons.push(condition);
    }
  }

  return reasons;
}
