import type { RequestHandler } from "express";

import type { PrismaClient } from "../../generated/prisma/client.js";
import type { FamilyRole } from "../../generated/prisma/enums.js";
import { sendError } from "../http/errors.js";
import { InvalidTokenError } from "./verifyToken.js";
import type { VerifiedToken } from "./verifyToken.js";

export type AuthenticatedUser = {
  id: string;
  authUserId: string;
  familyId?: string;
  role?: FamilyRole;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Resolves a Supabase JWT to a domain user on every request. The lookup is
 * deliberately not cached and role is not read from the token: a removal or a
 * role change must take effect on the very next request.
 */
export function createAuthMiddleware(deps: {
  verify: (token: string) => Promise<VerifiedToken>;
  prisma: PrismaClient;
}): RequestHandler {
  return function authenticate(req, res, next): void {
    const header = req.header("authorization");
    const token =
      header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : undefined;

    if (token === undefined || token === "") {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    deps
      .verify(token)
      .then(async (verified) => {
        const user = await deps.prisma.user.findFirst({
          where: { authUserId: verified.authUserId, deletedAt: null },
          include: {
            memberships: {
              where: { status: "active", deletedAt: null },
              select: { familyId: true, role: true },
              take: 1,
            },
          },
        });

        if (user === null) {
          sendError(
            res,
            403,
            "REGISTRATION_REQUIRED",
            "This account has not completed registration. Call POST /api/v1/auth/register.",
          );
          return;
        }

        const membership = user.memberships[0];
        req.user = {
          id: user.id,
          authUserId: user.authUserId,
          ...(membership !== undefined && { familyId: membership.familyId, role: membership.role }),
        };
        next();
      })
      .catch((error: unknown) => {
        if (error instanceof InvalidTokenError) {
          // The reason goes to the log only. A client learning *why* a token
          // failed learns whether it forged a signature or merely guessed.
          console.error("token rejected", { reason: error.message });
          sendError(res, 401, "UNAUTHENTICATED", "The token is not valid.");
          return;
        }
        next(error);
      });
  };
}
