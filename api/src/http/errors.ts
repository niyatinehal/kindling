import type { Response } from "express";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "REGISTRATION_REQUIRED"
  | "FORBIDDEN_ROLE"
  | "NOT_IN_FAMILY"
  // A valid, registered caller who has not completed wellness intake. Like
  // REGISTRATION_REQUIRED it is a step in the journey rather than a failure —
  // the client's move is to send the user to /onboarding/profile.
  | "PROFILE_REQUIRED"
  | "FLOOR_LOCKED"
  | "ALREADY_IN_FAMILY"
  | "INVITE_EXPIRED"
  // A deletion refused because the caller is the last admin of a household
  // that still has people in it. Like the two above it this is an instruction
  // rather than a fault: hand admin over, then delete.
  | "FAMILY_NEEDS_ADMIN"
  | "VALIDATION_FAILED"
  // No route matched the path and method at all, as opposed to a route that
  // ran and found nothing — those answer VALIDATION_FAILED with a reason.
  | "NOT_FOUND"
  | "INTERNAL";

/**
 * The single response shape for every API failure. Messages are written for a
 * client developer, never carrying a token, a driver error, a connection
 * string, or whether a given email exists.
 */
export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}
