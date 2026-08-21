import { readJsonBody } from "../api/readJsonBody";
import { nextStep } from "../onboarding/nextStep";

/**
 * Signs in as a guest and answers where that person belongs next.
 *
 * Extracted because two screens now start this journey: the sign-in screen,
 * where it has always been, and the landing page, where it is the primary
 * action — a visitor should be able to see the product without deciding to
 * have an account first.
 *
 * The second call is not incidental. A guest goes through exactly the same
 * seam as everyone else — GET /api/me answers 403 REGISTRATION_REQUIRED, which
 * `nextStep` routes to /consent — so the journey after sign-in has no guest
 * branch in it at all. Duplicating that reasoning across two components is how
 * the two would eventually disagree about it.
 */
export async function enterAsGuest(): Promise<{ destination: string } | null> {
  const response = await fetch("/api/auth/guest", { method: "POST" });

  if (!response.ok) {
    return null;
  }

  const me = await fetch("/api/me");
  return { destination: nextStep(me.status, await readJsonBody(me)) };
}
