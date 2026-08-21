/**
 * Generous, because nothing is waiting on this — the callers schedule it with
 * `after()`, so the person already has their answer. Two seconds was the first
 * guess and it was wrong: the web functions run in Washington and the API in
 * Singapore on a shared free instance, and a TLS handshake across that on a
 * cold connection does not fit. It still needs a bound, so the invocation
 * cannot be held open indefinitely by an API that has stopped answering.
 */
const TIMEOUT_MS = 15_000;

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
 * Scheduled with `after()` by its callers, and it never throws.
 *
 * Two wrong versions preceded this one, both found against production rather
 * than by any test here. The first was fire-and-forget, copied from the API
 * where the process outlives the response — a Vercel function is frozen the
 * moment it responds, so the request died unsent. The second awaited it inside
 * the handler, which delivered the report but put a cross-continental round
 * trip in front of the user's error message, and then timed out anyway.
 *
 * `after()` is the primitive for this: the response goes out immediately and
 * Vercel keeps the invocation alive for the work behind it. Nobody waits, so
 * the timeout can be long enough to actually succeed.
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
