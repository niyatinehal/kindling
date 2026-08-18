import { redirect } from "next/navigation";

import { familyDashboard } from "../../../src/family/familyDashboard";
import { currentStep } from "../../../src/onboarding/currentStep";
import { FamilyDashboardView } from "./FamilyDashboardView";

/**
 * Admin-only in effect, but not by redirect: a non-admin sees an explanation
 * instead of being bounced, because "you are not the admin" is information and a
 * silent redirect is not.
 */
export default async function FamilyDashboardPage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  return <FamilyDashboardView members={await familyDashboard()} />;
}
