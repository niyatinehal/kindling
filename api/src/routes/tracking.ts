import { Router } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import type { VerifiedToken } from "../auth/verifyToken.js";
import { sendError } from "../http/errors.js";
import { recordLog, summarise, todaysWorkoutLogs } from "../services/trackingService.js";
import { parseCalendarDay } from "../tracking/period.js";

/**
 * One body schema per type rather than one permissive schema, because the fields
 * mean different things per type and a single shape would accept nonsense: water
 * with a `plan_exercise_id`, a workout with a millilitre count, sleep marked
 * `skipped`. The discriminated union makes each combination either valid or a 400.
 *
 * `strictObject`, not `object`: zod strips unknown keys by default, which would
 * silently discard a field the client believed it was sending. A client that
 * attaches `plan_exercise_id` to a water log thinks it linked something, and
 * quietly dropping it hides the bug instead of reporting it.
 */
const logBody = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("water"),
    logged_for: z.string(),
    /// A glass to a bottle. Beyond 5l in one entry is a typo, not thirst.
    value: z.number().int().min(10).max(5000),
  }),
  z.strictObject({
    type: z.literal("sleep"),
    logged_for: z.string(),
    /// Minutes. 16h is the ceiling; anything more is a mis-entry.
    value: z.number().int().min(1).max(960),
    rating: z.number().int().min(1).max(5).nullable().default(null),
  }),
  z.strictObject({
    type: z.literal("workout"),
    logged_for: z.string(),
    plan_exercise_id: z.string().uuid(),
    status: z.enum(["completed", "skipped"]),
    rating: z.number().int().min(1).max(5).nullable().default(null),
  }),
  z.strictObject({
    type: z.literal("meal"),
    logged_for: z.string(),
    status: z.enum(["completed", "skipped"]),
    /// A library dish, when it was one. FR-TRK-2 logs meals "from suggested plan
    /// or freeform", so exactly one of these two carries what was eaten.
    recipe_key: z.string().max(60).nullable().default(null),
    /// What the user typed, for a dish the library does not know. Trimmed and
    /// length-capped; it is displayed verbatim, never translated.
    notes: z.string().trim().min(1).max(200).nullable().default(null),
  }),
]);

export function createTrackingRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

  router.post("/logs", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = logBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    const loggedFor = parseCalendarDay(parsed.data.logged_for);
    if (loggedFor === null) {
      sendError(res, 400, "VALIDATION_FAILED", "logged_for must be a YYYY-MM-DD date.");
      return;
    }

    const body = parsed.data;

    // A meal log with neither a dish nor a name records that someone ate
    // something unspecified, which counts toward adherence while telling nobody
    // anything. One of the two is required.
    if (body.type === "meal" && body.recipe_key === null && body.notes === null) {
      sendError(res, 400, "VALIDATION_FAILED", "A meal needs either a recipe_key or a name.");
      return;
    }

    recordLog(deps.prisma, {
      userId: user.id,
      type: body.type,
      // Water and sleep are not pass/fail — they are quantities, so their status
      // is `logged`. Only a scheduled thing can be completed or skipped.
      status: body.type === "water" || body.type === "sleep" ? "logged" : body.status,
      loggedFor,
      value: body.type === "water" || body.type === "sleep" ? body.value : null,
      planExerciseId: body.type === "workout" ? body.plan_exercise_id : null,
      rating: body.type === "sleep" || body.type === "workout" ? body.rating : null,
      recipeKey: body.type === "meal" ? body.recipe_key : null,
      notes: body.type === "meal" ? body.notes : null,
    })
      .then((log) => {
        res.status(201).json({ log: { id: log.id, type: log.type, status: log.status } });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  router.get("/summary", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const now = new Date();

    Promise.all([
      summarise(deps.prisma, { userId: user.id, now }),
      todaysWorkoutLogs(deps.prisma, { userId: user.id, now }),
    ])
      .then(([summary, today]) => {
        res.status(200).json({
          summary,
          today: today.map((entry) => ({
            plan_exercise_id: entry.planExerciseId,
            status: entry.status,
          })),
        });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  return router;
}
