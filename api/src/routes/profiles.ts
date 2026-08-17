import { Router } from "express";
import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import type { VerifiedToken } from "../auth/verifyToken.js";
import { sendError } from "../http/errors.js";
import { toProfileView } from "../profile/toProfileView.js";
import { upsertProfile } from "../services/upsertProfile.js";

const SEXES = ["male", "female", "other", "prefer_not_to_say"] as const;
const GOALS = [
  "fat_loss",
  "muscle_gain",
  "general_fitness",
  "mobility",
  "endurance",
  "strength",
] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const SPACES = ["small_room", "large_room", "outdoor", "gym"] as const;
const EQUIPMENT = [
  "none",
  "resistance_band",
  "dumbbells",
  "kettlebell",
  "pull_up_bar",
  "yoga_mat",
  "jump_rope",
  "bench",
  "treadmill",
  "stationary_bike",
  "full_gym",
] as const;
const INJURIES = ["knee", "lower_back", "shoulder", "neck", "wrist", "ankle", "hip"] as const;
const CONDITIONS = [
  "type_2_diabetes",
  "hypertension",
  "heart_condition",
  "asthma",
  "arthritis",
  "osteoporosis",
  "pregnancy",
  "thyroid_disorder",
] as const;
const DIETARY = [
  "vegetarian",
  "non_vegetarian",
  "eggetarian",
  "jain",
  "vegan",
  "no_dairy",
  "no_gluten",
  "no_nuts",
] as const;

/**
 * `.min(1)` on equipment is the one validation carrying product meaning rather
 * than hygiene: `["none"]` is a user saying they own nothing, `[]` is a user who
 * never answered. Only the first can safely produce a workout plan, so an empty
 * array is refused here and the plan generator is spared a "did they answer?"
 * branch it would otherwise need forever.
 *
 * Optional measurements are `.nullable()`, not merely `.optional()`: PUT
 * replaces the whole profile, so clearing a weight has to be expressible.
 */
const profileBody = z.object({
  birth_year: z
    .number()
    .int()
    .min(1900)
    // Not a hygiene check: a future birth year yields a negative age, and age
    // drives both the elderly track and the safety rules downstream.
    .refine((year) => year <= new Date().getUTCFullYear(), {
      message: "birth_year cannot be in the future",
    }),
  sex: z.enum(SEXES).nullable().default(null),
  height_cm: z.number().int().min(50).max(280).nullable().default(null),
  weight_kg: z.number().min(10).max(400).nullable().default(null),
  goal: z.enum(GOALS),
  level: z.enum(LEVELS),
  space: z.enum(SPACES),
  equipment: z.array(z.enum(EQUIPMENT)).min(1, { message: "equipment cannot be empty" }),
  injuries: z.array(z.enum(INJURIES)).default([]),
  conditions: z.array(z.enum(CONDITIONS)).default([]),
  dietary: z.array(z.enum(DIETARY)).default([]),
  notes: z.string().max(500).nullable().default(null),
});

export function createProfileRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

  /**
   * `/me` rather than `/{userId}`: with owner-writes-only, an id in the path
   * could only ever be the caller's own, and accepting one you then have to
   * check is an authorization hole waiting to be written. This route makes
   * reading someone else's profile unrepresentable. `/{userId}` arrives with the
   * family slice, when there is a second reader to authorize and a visibility
   * setting to filter by.
   */
  router.get("/me", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    deps.prisma.profile
      .findUnique({ where: { userId: user.id } })
      .then((row) => {
        // Having no profile is a NORMAL state — intake is an invitation, not a
        // gate — so it is a 200 with a null body, not a 404. Reserving non-2xx
        // for real faults keeps `/home` out of error-handling paths.
        res.status(200).json({ profile: row === null ? null : toProfileView(row, new Date()) });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  router.put("/me", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid body.");
      return;
    }

    upsertProfile(deps.prisma, {
      userId: user.id,
      birthYear: parsed.data.birth_year,
      sex: parsed.data.sex,
      heightCm: parsed.data.height_cm,
      weightKg: parsed.data.weight_kg,
      goal: parsed.data.goal,
      level: parsed.data.level,
      space: parsed.data.space,
      equipment: parsed.data.equipment,
      injuries: parsed.data.injuries,
      conditions: parsed.data.conditions,
      dietary: parsed.data.dietary,
      notes: parsed.data.notes,
    })
      .then((row) => {
        res.status(200).json({ profile: toProfileView(row, new Date()) });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  return router;
}
