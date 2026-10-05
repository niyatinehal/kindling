import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
import { currentPantryConsent } from "../../src/meals/pantryConsent";
import { hasProfile } from "../../src/onboarding/hasProfile";
import { MealsClient } from "./MealsClient";

/**
 * Guarded like every other signed-in screen. A missing profile is not a redirect:
 * pantry matching works without one, it just cannot respect dietary constraints
 * that were never declared — which the screen says out loud.
 */
export default async function MealsPage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  const [profile, pantryConsent] = await Promise.all([hasProfile(), currentPantryConsent()]);

  return <MealsClient hasProfile={profile} pantryConsent={pantryConsent} />;
}
