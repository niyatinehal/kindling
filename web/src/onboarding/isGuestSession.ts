import { createSupabaseServerClient } from "../supabase/server";

/**
 * Whether the current session belongs to an anonymous ("guest") user.
 *
 * `getUser()` rather than `getSession()`: getSession reads the cookie without
 * revalidating it. Today this only decides a chip and a pre-filled name, so
 * either would do — but a helper named "is this a guest" will eventually be
 * reached for in a decision that matters, and one that is safe only by
 * accident is a trap. The cost is a cached round trip on two screens.
 *
 * Never throws. Every failure — no session, an unreadable session, a missing
 * env var — answers `false`, because this must never be the reason a page
 * fails to render. `is_anonymous` is also absent for accounts created before
 * anonymous sign-in existed, which the `=== true` handles.
 */
export async function isGuestSession(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.is_anonymous === true;
  } catch (reason) {
    console.error("guest status could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return false;
  }
}
