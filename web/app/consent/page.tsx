import { isGuestSession } from "../../src/onboarding/isGuestSession";
import { ConsentClient } from "./ConsentClient";

/**
 * Resolves guest status server-side, for the same reason `/home` resolves the
 * onboarding step server-side: the answer comes from the session, and the
 * session is only trustworthy on the server. A `?guest=1` parameter would be
 * spoofable, and a prop from the client would be worse.
 *
 * `page.tsx` has to be async to do that, and `useState` cannot live in an
 * async component — hence the split into `ConsentClient`, mirroring the
 * `page.tsx` + `HomeView.tsx` pattern `/home` already uses.
 */
export default async function ConsentPage() {
  return <ConsentClient isGuest={await isGuestSession()} />;
}
