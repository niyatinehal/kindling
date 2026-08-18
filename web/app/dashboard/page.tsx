import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
import { trackingState } from "../../src/tracking/summary";
import { DashboardView } from "./DashboardView";

/**
 * Server-rendered: the whole screen is a read of one endpoint, and there is
 * nothing to interact with beyond the hover titles the SVG carries natively. A
 * client component here would ship JavaScript to draw static rectangles.
 */
export default async function DashboardPage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  const tracking = await trackingState();

  return <DashboardView summary={tracking.summary} />;
}
