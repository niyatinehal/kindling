import { redirect } from "next/navigation";

import { currentFamily } from "../../src/family/currentFamily";
import { currentStep } from "../../src/onboarding/currentStep";
import { FamilyClient } from "./FamilyClient";

/**
 * Guarded by the same `currentStep` as every other signed-in screen. Being in no
 * family is NOT a redirect — it is the screen's main job to offer creating or
 * joining one.
 */
export default async function FamilyPage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  return <FamilyClient initialFamily={await currentFamily()} />;
}
