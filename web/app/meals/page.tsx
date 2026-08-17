import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
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

  return <MealsClient hasProfile={await hasProfile()} />;
}
