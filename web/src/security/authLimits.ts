import { NextResponse } from "next/server";

import { createRateLimiter } from "./rateLimit";

const FIFTEEN_MINUTES = 15 * 60_000;

/**
 * The limits for the three unauthenticated routes — the whole surface a
 * stranger can reach without a session, and therefore the whole surface worth
 * throttling.
 *
 * Two keys on the routes that take a contact, because either alone is a hole:
 * by contact only, one caller can walk a list of addresses unchecked; by IP
 * only, a distributed script still empties one person's allowance. The contact
 * limit protects the person, the IP limit protects the quota.
 *
 * The numbers are chosen against what the endpoint costs. Sending an OTP
 * spends a message from a daily quota and, on SMS, real money — three in
 * fifteen minutes is already more than anyone signing in honestly needs.
 * Verifying spends nothing but guesses at a six-digit code, so five is the
 * ceiling that keeps a million-key space out of reach.
 */
export const otpByContact = createRateLimiter({ limit: 3, windowMs: FIFTEEN_MINUTES });
export const otpByIp = createRateLimiter({ limit: 15, windowMs: FIFTEEN_MINUTES });
export const verifyByContact = createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES });
export const verifyByIp = createRateLimiter({ limit: 30, windowMs: FIFTEEN_MINUTES });
export const guestByIp = createRateLimiter({ limit: 10, windowMs: FIFTEEN_MINUTES });

/**
 * Best effort, and it has to be. `x-forwarded-for` is set by Vercel's edge and
 * is trustworthy there, but it is a header, and a header can be forged if the
 * app is ever reached without that proxy in front. Which is why this is only
 * ever the SECOND key: nothing here depends on the IP being honest, it only
 * makes the cheap attack more expensive.
 */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first !== undefined && first !== "" ? first : "unknown";
}

/** Same address in a different shape must not buy a second allowance. */
export function contactKey(contact: string): string {
  return contact.trim().toLowerCase();
}

export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  // The body says only that it was refused. Which of the two limits was hit,
  // and therefore whether an address is already known here, is not the
  // caller's business — the same reason the OTP route's failure is generic.
  return NextResponse.json(
    { error: { code: "RATE_LIMITED" } },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}
