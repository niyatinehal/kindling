import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
import { hasProfile } from "../../src/onboarding/hasProfile";
import { currentPlan } from "../../src/plan/currentPlan";
import { trackingState } from "../../src/tracking/summary";
import { PlanClient } from "./PlanClient";

/**
 * Guarded by the same `currentStep` as `/home` and `/onboarding/profile`, for the
 * same reason: this URL is reachable by typing it, and a caller with no `users`
 * row has nothing to build a plan from.
 *
 * A missing profile is NOT a redirect. Intake stayed an invitation in the profile
 * slice, so this screen explains what it needs and links there — bouncing the
 * user would undo that decision.
 */
export default async function PlanPage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  // Concurrent: neither answer depends on the other, and both are round trips.
  const [profileExists, plan, tracking] = await Promise.all([
    hasProfile(),
    currentPlan(),
    trackingState(),
  ]);

  return <PlanClient initialPlan={plan} hasProfile={profileExists} initialTicks={tracking.today} />;
}
