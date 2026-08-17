import type { DataCategory, FamilyRole } from "../../generated/prisma/enums.js";

/**
 * Every category a member can share or withhold. Listed explicitly rather than
 * derived, so adding a category to the enum without deciding its default is a
 * compile error rather than a silently-missing row.
 */
const ALL_CATEGORIES: readonly DataCategory[] = [
  "adherence_summary",
  "weight",
  "workout_detail",
  "meal_detail",
  "sleep",
  "water",
  "medical_conditions",
];

/**
 * The safety floor (PRD FR-FAM-3) applies to these roles only.
 *
 * An adult or admin may hide their adherence summary freely. A child or elderly
 * member cannot, because it is the single signal that would reveal they have
 * stopped engaging entirely — which is the one thing the family is watching for.
 */
const FLOOR_LOCKED_ROLES: readonly FamilyRole[] = ["child", "elderly"];

/**
 * The rows to create alongside a new membership.
 *
 * Asymmetric by design, and the asymmetry is the product decision: PRD §12
 * promises visibility is "not full surveillance by default", while FR-FAM-1
 * needs the admin dashboard to show something. So `adherence_summary` — "did
 * they log anything at all" — starts visible, and everything genuinely sensitive
 * (weight, medical conditions, meal and workout detail) starts hidden and is the
 * member's to share.
 *
 * `isLockedBySafetyFloor` constrains WRITES only. It means "this member may not
 * hide this category on their own"; it never means an admin may read a category
 * the member has hidden.
 */
export function defaultVisibilityFor(role: FamilyRole): {
  dataCategory: DataCategory;
  visibility: "visible" | "hidden";
  isLockedBySafetyFloor: boolean;
}[] {
  return ALL_CATEGORIES.map((dataCategory) => {
    const isAdherence = dataCategory === "adherence_summary";

    return {
      dataCategory,
      visibility: isAdherence ? ("visible" as const) : ("hidden" as const),
      isLockedBySafetyFloor: isAdherence && FLOOR_LOCKED_ROLES.includes(role),
    };
  });
}
