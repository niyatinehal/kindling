import { redirect } from "next/navigation";

import { hasFamily } from "../../src/family/hasFamily";
import { dishIdeas } from "../../src/meals/dishIdeas";
import { currentStep } from "../../src/onboarding/currentStep";
import { hasProfile } from "../../src/onboarding/hasProfile";
import { isGuestSession } from "../../src/onboarding/isGuestSession";
import { currentPlan } from "../../src/plan/currentPlan";
import { trackingState } from "../../src/tracking/summary";
import { HomeView } from "./HomeView";

/**
 * The guard for the whole journey, and the reason it lives HERE rather than in
 * `/auth/callback`: someone following a sign-in link arrives at /home with a
 * Supabase session but no `users` row, no consent record and no display name,
 * and so does a guest, and so does anyone who simply types the URL.
 * Redirecting from the callback would close only the first of those. Guarding
 * the destination closes all three.
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
  // redirected caller pays for none of them. Concurrent because no answer
  // depends on another and every one is a round trip.
  const [isGuest, profileExists, familyExists, tracking, plan, dishes] = await Promise.all([
    isGuestSession(),
    hasProfile(),
    hasFamily(),
    trackingState(),
    currentPlan(),
    dishIdeas(),
  ]);

  // ISO weekday in UTC, the same reckoning the plan screen uses, so the two
  // never disagree about which day "today" is. An empty list is a rest day;
  // `null` means there is no plan at all.
  const isoToday = new Date().getUTCDay() === 0 ? 7 : new Date().getUTCDay();
  const todayExercises =
    plan === null ? null : (plan.days.find((day) => day.day_of_week === isoToday)?.exercises ?? []);

  return (
    <HomeView
      isGuest={isGuest}
      hasProfile={profileExists}
      inFamily={familyExists}
      summary={tracking.summary}
      todayExercises={todayExercises}
      dishes={dishes}
    />
  );
}
