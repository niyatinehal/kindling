import { redirect } from "next/navigation";

import { currentStep } from "../../src/onboarding/currentStep";
import { hasProfile } from "../../src/onboarding/hasProfile";
import { isGuestSession } from "../../src/onboarding/isGuestSession";
import { trackingState } from "../../src/tracking/summary";
import { HomeView } from "./HomeView";

/**
 * The guard for the whole journey, and the reason it lives HERE rather than in
 * `/auth/callback`: a first-time Google user arrives at /home with a Supabase
 * session but no `users` row, no consent record and no display name, and so
 * does anyone who simply types the URL. Redirecting from the callback would
 * close only the first of those. Guarding the destination closes both.
 *
 * Nothing is caught around `redirect()` on purpose: it signals the redirect by
 * throwing, and `currentStep` already resolves every failure to a destination,
 * so there is nothing left here that needs a try/catch.
 */
export default async function HomePage() {
  const step = await currentStep();

  if (step !== "/home") {
    redirect(step);
  }

  // Resolved only after the guard has decided this request belongs here, so a
  // redirected caller never pays for either call. Concurrent because neither
  // answer depends on the other, and both are round trips.
  const [isGuest, profileExists, tracking] = await Promise.all([
    isGuestSession(),
    hasProfile(),
    trackingState(),
  ]);

  return <HomeView isGuest={isGuest} hasProfile={profileExists} summary={tracking.summary} />;
}
