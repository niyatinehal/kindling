import type { RequestHandler } from "express";

import type { FamilyRole } from "../../generated/prisma/enums.js";
import { sendError } from "../http/errors.js";

/**
 * Role enforcement, server-side, on every guarded request.
 *
 * PRD §17 requires that role permissions be "enforced server-side on every
 * request, never trusted from client state". `authMiddleware` already resolves
 * the role from the database rather than from the token on each request — a
 * removal or a demotion takes effect on the very next call — and this turns that
 * resolved role into a gate.
 *
 * The two failure modes are deliberately distinct codes rather than one 403:
 * "you are in no family" and "your role is not enough" send the client to
 * different screens, and collapsing them would leave a member who was removed
 * looking at a permissions error.
 */
export function requireRole(...allowed: FamilyRole[]): RequestHandler {
  return function guard(req, res, next): void {
    const user = req.user;

    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }
    if (user.familyId === undefined || user.role === undefined) {
      sendError(res, 403, "NOT_IN_FAMILY", "This action requires membership of a family.");
      return;
    }
    if (!allowed.includes(user.role)) {
      // The required role is not echoed back: telling a child which role would
      // have worked is a hint about the shape of the family's permissions.
      sendError(res, 403, "FORBIDDEN_ROLE", "Your role does not allow this action.");
      return;
    }

    next();
  };
}
