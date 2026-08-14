import { Router } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { sendError } from "../http/errors.js";
import { registerUser } from "../services/registerUser.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import { InvalidTokenError } from "../auth/verifyToken.js";
import type { VerifiedToken } from "../auth/verifyToken.js";

const registerBody = z.object({
  display_name: z.string().min(1).max(120),
  locale: z.enum(["en", "hi"]).default("en"),
  consents: z
    .array(
      z.object({
        consent_type: z.enum([
          "health_data",
          "minor_guardian",
          "marketing_notifications",
          "photo_retention",
        ]),
        policy_version: z.string().min(1),
      }),
    )
    .min(1)
    // Every feature in the product processes health data, so there is no
    // coherent account without this consent.
    .refine((consents) => consents.some((consent) => consent.consent_type === "health_data"), {
      message: "health_data consent is required",
    }),
});

export function createAuthRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();

  // Deliberately NOT behind authMiddleware: the caller has a valid Supabase
  // token but has no users row yet, which is exactly what the middleware
  // rejects with REGISTRATION_REQUIRED.
  router.post("/register", (req, res, next) => {
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
        const parsed = registerBody.safeParse(req.body);
        if (!parsed.success) {
          sendError(
            res,
            400,
            "VALIDATION_FAILED",
            parsed.error.issues[0]?.message ?? "Invalid body.",
          );
          return;
        }

        const user = await registerUser(deps.prisma, {
          authUserId: verified.authUserId,
          ...(verified.email !== undefined && { email: verified.email }),
          ...(verified.phone !== undefined && { phone: verified.phone }),
          displayName: parsed.data.display_name,
          locale: parsed.data.locale,
          consents: parsed.data.consents.map((consent) => ({
            consentType: consent.consent_type,
            policyVersion: consent.policy_version,
          })),
        });

        res.status(201).json({
          id: user.id,
          display_name: user.displayName,
          locale: user.locale,
          email: user.email,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof InvalidTokenError) {
          console.error("token rejected at register", { reason: error.message });
          sendError(res, 401, "UNAUTHENTICATED", "The token is not valid.");
          return;
        }
        next(error);
      });
  });

  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

  router.get("/me", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    deps.prisma.user
      .findUniqueOrThrow({ where: { id: user.id } })
      .then((row) => {
        res.status(200).json({
          id: row.id,
          display_name: row.displayName,
          locale: row.locale,
          email: row.email,
          family: user.familyId === undefined ? null : { id: user.familyId, role: user.role },
        });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  return router;
}
