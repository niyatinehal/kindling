export type HandledFailure = {
  /** An upper-case identifier the API will store as the event name. */
  code: string;
  status: number;
  path?: string;
  requestId?: string;
  detail?: string;
};

/**
 * Tells the API about a failure this app dealt with by itself.
 *
 * There is a category of problem that was completely invisible. When Brevo's
 * daily quota runs out, `signInWithOtp` returns an error, the OTP route logs
 * it and answers OTP_REQUEST_FAILED — handled, deliberately, so the user gets
 * a sensible message. But handled means it never throws, never reaches the
 * API's error handler, and never lands in the error table. The one failure
 * most likely to ruin a launch day was the one nobody could see, while the
 * user was being told to check an email address that was fine.
 *
 * Fire and forget, and it never throws. It is called on a path that is already
 * failing; if reporting could fail the request, then making a problem visible
 * would have made it worse.
 *
 * Silent when `INTERNAL_REPORT_TOKEN` is unset, because that is also how the
 * API decides not to mount the receiving route. Both ends agree by default,
 * and an environment that has not been given the secret simply behaves the way
 * it did before this existed.
 */
export async function reportFailure(failure: HandledFailure): Promise<void> {
  const token = process.env["INTERNAL_REPORT_TOKEN"];
  const base = process.env["API_BASE_URL"];

  if (token === undefined || base === undefined) {
    return;
  }

  try {
    await fetch(`${base.replace(/\/+$/, "")}/api/v1/internal/error-reports`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": token },
      body: JSON.stringify(failure),
      // Never attach the session cookie: this is a server-to-server report and
      // the API has no use for a user credential it did not ask for.
      credentials: "omit",
      cache: "no-store",
    });
  } catch (reason) {
    // The last resort, and the only place this file logs. If the API is
    // unreachable, reporting that the API is unreachable cannot go to the API.
    console.error("could not report handled failure", {
      code: failure.code,
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  }
}
