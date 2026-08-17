import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import { requireRole } from "../auth/requireRole.js";
import type { VerifiedToken } from "../auth/verifyToken.js";
import { sendError } from "../http/errors.js";
import {
  acceptInvite,
  AlreadyInFamilyError,
  changeMemberRole,
  createFamily,
  createInvite,
  InviteUnusableError,
  LastAdminError,
  listMembers,
  removeMember,
} from "../services/familyService.js";

const createBody = z.object({ name: z.string().min(1).max(120) });
const inviteBody = z.object({
  invited_role: z.enum(["adult", "child", "elderly"]),
  invited_contact: z.string().max(160).nullable().default(null),
});
const roleBody = z.object({ role: z.enum(["admin", "adult", "child", "elderly"]) });

/**
 * Family and invite routes (design doc Phase B).
 *
 * Every route below the family level re-checks that the caller's OWN resolved
 * membership matches the `:id` in the path. `requireRole` proves the caller is an
 * admin of some family; it cannot prove they are an admin of THIS one, and
 * without the second check an admin of family A could administer family B.
 */
export function createFamilyRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

  /** Rejects a caller acting on a family that is not the one they belong to. */
  const sameFamily = (req: Request): boolean =>
    req.user?.familyId !== undefined && req.user.familyId === req.params["id"];

  router.post("/", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    createFamily(deps.prisma, { userId: user.id, name: parsed.data.name, now: new Date() })
      .then((family) => {
        res.status(201).json({ family: { id: family.id, name: family.name, role: "admin" } });
      })
      .catch((error: unknown) => {
        if (error instanceof AlreadyInFamilyError) {
          sendError(res, 409, "ALREADY_IN_FAMILY", error.message);
          return;
        }
        next(error);
      });
  });

  router.post("/:id/invites", authenticate, requireRole("admin"), (req, res, next) => {
    const user = req.user;
    if (user === undefined || !sameFamily(req)) {
      sendError(res, 403, "FORBIDDEN_ROLE", "Your role does not allow this action.");
      return;
    }

    const parsed = inviteBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    createInvite(deps.prisma, {
      familyId: user.familyId as string,
      createdByUserId: user.id,
      invitedRole: parsed.data.invited_role,
      invitedContact: parsed.data.invited_contact,
      now: new Date(),
    })
      .then((invite) => {
        res.status(201).json({
          invite: {
            // The code is returned ONCE, to the admin who created it. It is the
            // whole authorisation to join, so it is never echoed by a list route.
            code: invite.inviteCode,
            invited_role: invite.invitedRole,
            expires_at: invite.expiresAt.toISOString(),
          },
        });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  router.get(
    "/:id/members",
    authenticate,
    requireRole("admin", "adult", "child", "elderly"),
    (req, res, next) => {
      if (!sameFamily(req)) {
        sendError(res, 403, "FORBIDDEN_ROLE", "Your role does not allow this action.");
        return;
      }

      listMembers(deps.prisma, req.params["id"] as string)
        .then((members) => {
          res.status(200).json({
            members: members.map((membership) => ({
              user_id: membership.userId,
              display_name: membership.user.displayName,
              role: membership.role,
              status: membership.status,
              joined_at: membership.joinedAt.toISOString(),
            })),
          });
        })
        .catch((error: unknown) => {
          next(error);
        });
    },
  );

  router.patch(
    "/:id/members/:userId/role",
    authenticate,
    requireRole("admin"),
    (req, res, next) => {
      if (!sameFamily(req)) {
        sendError(res, 403, "FORBIDDEN_ROLE", "Your role does not allow this action.");
        return;
      }

      const parsed = roleBody.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          "VALIDATION_FAILED",
          parsed.error.issues[0]?.message ?? "Invalid body.",
        );
        return;
      }

      changeMemberRole(deps.prisma, {
        familyId: req.params["id"] as string,
        userId: req.params["userId"] as string,
        role: parsed.data.role,
      })
        .then(() => {
          res.status(204).end();
        })
        .catch((error: unknown) => {
          if (error instanceof LastAdminError) {
            sendError(res, 409, "VALIDATION_FAILED", error.message);
            return;
          }
          if (error instanceof InviteUnusableError) {
            sendError(res, 404, "VALIDATION_FAILED", error.message);
            return;
          }
          next(error);
        });
    },
  );

  router.delete("/:id/members/:userId", authenticate, requireRole("admin"), (req, res, next) => {
    if (!sameFamily(req)) {
      sendError(res, 403, "FORBIDDEN_ROLE", "Your role does not allow this action.");
      return;
    }

    removeMember(deps.prisma, {
      familyId: req.params["id"] as string,
      userId: req.params["userId"] as string,
    })
      .then(() => {
        res.status(204).end();
      })
      .catch((error: unknown) => {
        if (error instanceof LastAdminError) {
          sendError(res, 409, "VALIDATION_FAILED", error.message);
          return;
        }
        if (error instanceof InviteUnusableError) {
          sendError(res, 404, "VALIDATION_FAILED", error.message);
          return;
        }
        next(error);
      });
  });

  return router;
}

/**
 * Invite redemption, mounted separately at `/api/v1/invites`.
 *
 * Not under `/families/:id` on purpose: the invitee does not know the family id,
 * and requiring it would leak family ids into codes that get read aloud.
 */
export function createInviteRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

  router.post("/:code/accept", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    acceptInvite(deps.prisma, {
      userId: user.id,
      code: req.params["code"] as string,
      now: new Date(),
    })
      .then((joined) => {
        res.status(200).json({ family: { id: joined.familyId, role: joined.role } });
      })
      .catch((error: unknown) => {
        if (error instanceof AlreadyInFamilyError) {
          sendError(res, 409, "ALREADY_IN_FAMILY", error.message);
          return;
        }
        if (error instanceof InviteUnusableError) {
          // 410 per the design doc: the code is gone, not merely wrong. Wrong,
          // used, revoked and expired all answer identically so the endpoint
          // cannot be used to enumerate valid codes.
          sendError(res, 410, "INVITE_EXPIRED", error.message);
          return;
        }
        next(error);
      });
  });

  return router;
}
