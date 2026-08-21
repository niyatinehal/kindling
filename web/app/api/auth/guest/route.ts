import { NextResponse, after } from "next/server";

import { callerIp, guestByIp, tooManyRequests } from "../../../../src/security/authLimits";
import { reportFailure } from "../../../../src/observability/reportFailure";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

/**
 * Signs the caller in as an anonymous Supabase user.
 *
 * The guest gets a real `auth.users` row and a real ES256 JWT, which is the
 * entire point: `users.auth_user_id` is a NOT NULL foreign key into
 * `auth.users`, and the API resolves every request through a verified token.
 * A synthetic guest session would need holes in both. This needs neither —
 * nothing downstream of here knows or cares that the sign-in was anonymous.
 *
 * There is no request body, so there is nothing to validate. The caller then
 * follows exactly the path the OTP flow does: GET /api/me, which answers 403
 * REGISTRATION_REQUIRED, which `nextStep` routes to /consent. A guest is a
 * user who signed in differently, not a user with a different journey.
 */
export async function POST(request: Request) {
  // Every guest is a real row in auth.users. There is no contact to key on, so
  // the caller is all there is — weaker than the OTP routes, and still enough
  // to stop one script filling the table.
  const perIp = guestByIp(callerIp(request));
  if (!perIp.allowed) {
    return tooManyRequests(perIp.retryAfterSeconds);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInAnonymously();

  if (error) {
    // Most likely `enable_anonymous_sign_ins` is false in this environment.
    // The reason is logged and never returned — same rule as /api/auth/otp.
    console.error("guest sign-in failed", { reason: error.message });

    // The landing page's primary button. A failure here is a visitor who
    // bounced, and nothing else would record that it happened.
    after(async () => {
      await reportFailure({
        code: "GUEST_SIGNIN_FAILED",
        status: 502,
        path: "/api/auth/guest",
        detail: error.message,
      });
    });
    return NextResponse.json({ error: { code: "GUEST_SIGNIN_FAILED" } }, { status: 502 });
  }

  // The session cookie was written by the client's cookie adapter, which
  // forces httpOnly. Nothing about the session is returned in the body.
  return NextResponse.json({ authenticated: true });
}
