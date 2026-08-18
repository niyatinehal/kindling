import { redirect } from "next/navigation";

import { currentStep } from "../../../src/onboarding/currentStep";
import { currentProfile } from "../../../src/onboarding/currentProfile";
import { Wizard } from "./Wizard";

/**
 * Guarded by the same `currentStep` as `/home`, and for the same reason: intake
 * is reachable by typing the URL, and someone who has not registered has no
 * `users` row for a profile to hang off. Reusing the guard rather than writing a
 * second one keeps the "403 REGISTRATION_REQUIRED means consent" rule in one
 * place — it already drifted once between the OAuth and OTP journeys.
 *
 * A completed profile is deliberately NOT redirected away. Re-running intake is
 * how FR-PROF-2's "editable at any time" works, and PUT replaces rather than
 * duplicating.
 */
export default async function ProfileOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  // `?next=plan` marks arrival from "rebuild my plan": the same form, but saving
  // regenerates and returns to the plan rather than going home.
  const params = await searchParams;
  const existing = await currentProfile();

  return <Wizard existing={existing} rebuildPlan={params["next"] === "plan"} />;
}
