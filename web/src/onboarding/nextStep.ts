import { errorCode } from "../api/errorCode";

export type OnboardingDestination = "/signin" | "/consent" | "/home" | "/error";

/**
 * Where the user goes after GET /api/me.
 *
 * The 403 REGISTRATION_REQUIRED is the seam between "Supabase knows you" and
 * "the product knows you" — a step in onboarding, not a failure. It is matched
 * on the CODE, never on the status alone: Phase B adds FORBIDDEN_ROLE, also a
 * 403, and routing that to the consent screen would post a second registration.
 */
export function nextStep(status: number, body: unknown): OnboardingDestination {
  if (status === 200) {
    return "/home";
  }
  if (status === 401) {
    return "/signin";
  }
  if (status === 403 && errorCode(body) === "REGISTRATION_REQUIRED") {
    return "/consent";
  }
  return "/error";
}
