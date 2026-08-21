import { Router } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { sendError } from "../http/errors.js";
import { redact } from "../observability/redact.js";

/**
 * A code, not a sentence. The web app reports which known failure it handled,
 * and the shape refuses anything long enough to be prose — this value ends up
 * in a column somebody reads later.
 */
const reportBody = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "code must be an upper-case identifier"),
  status: z.coerce.number().int().min(100).max(599),
  path: z.string().max(200).optional(),
  requestId: z.string().max(64).optional(),
  detail: z.string().max(500).optional(),
});

/**
 * Where the web app reports the failures it handles itself.
 *
 * Those were invisible. When Brevo's daily quota runs out, `signInWithOtp`
 * returns an error, the OTP route logs it and answers OTP_REQUEST_FAILED — a
 * handled failure, in a Next.js route handler, on Vercel. It never touches the
 * express error handler, so it never reached the error table, and the failure
 * most likely to ruin a launch day was the one nobody could see. The user just
 * gets told to check their email address, which is not what went wrong.
 *
 * A shared secret rather than a user token: the failures worth reporting
 * happen to people who are not signed in yet, so there is no user token to
 * present. With the secret unconfigured the route is not mounted at all —
 * an open write endpoint is a way to fill somebody's table, and a 404 does not
 * advertise a door to go looking for the key to.
 */
export function createErrorReportRouter(deps: {
  prisma: PrismaClient;
  internalReportToken: string;
}): Router {
  const router = Router();

  router.post("/error-reports", (req, res, next) => {
    // Compared before parsing: an unauthenticated caller should not be able to
    // tell a malformed body from a rejected one.
    if (req.header("x-internal-token") !== deps.internalReportToken) {
      sendError(res, 401, "UNAUTHENTICATED", "A valid internal token is required.");
      return;
    }

    const parsed = reportBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    const report = parsed.data;

    deps.prisma.errorEvent
      .create({
        data: {
          name: report.code,
          message: redact(report.detail ?? report.code),
          stack: null,
          status: report.status,
          requestId: report.requestId ?? null,
          method: "POST",
          path: report.path ?? null,
        },
      })
      .then(() => {
        // 202: this is a report about something that already happened, and the
        // caller has nothing to do with the outcome.
        res.status(202).end();
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  return router;
}
