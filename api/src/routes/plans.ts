import { Router } from "express";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import type { VerifiedToken } from "../auth/verifyToken.js";
import { sendError } from "../http/errors.js";
import {
  createWorkoutPlan,
  findActivePlan,
  ProfileRequiredError,
} from "../services/createWorkoutPlan.js";
import type { PlanWithExercises } from "../services/createWorkoutPlan.js";
import type { PlanGenerator } from "../workouts/planGenerator.js";

/**
 * Days are grouped in the response rather than returned flat.
 *
 * The client's question is always "what am I doing on day N", never "give me
 * every exercise"; grouping here means the web layer does not re-derive the same
 * grouping, and `/home` can index straight to today.
 */
function toPlanView(plan: PlanWithExercises) {
  const byDay = new Map<number, PlanWithExercises["exercises"]>();
  for (const exercise of plan.exercises) {
    const day = byDay.get(exercise.dayOfWeek) ?? [];
    day.push(exercise);
    byDay.set(exercise.dayOfWeek, day);
  }

  return {
    id: plan.id,
    generator: plan.generator,
    created_at: plan.createdAt.toISOString(),
    profile_snapshot: plan.profileSnapshot,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dayOfWeek, exercises]) => ({
        day_of_week: dayOfWeek,
        exercises: exercises.map((exercise) => ({
          exercise_key: exercise.exerciseKey,
          sets: "sets" in exercise ? exercise.sets : null,
          reps: "reps" in exercise ? exercise.reps : null,
          duration_seconds: "durationSeconds" in exercise ? exercise.durationSeconds : null,
          rest_seconds: "restSeconds" in exercise ? exercise.restSeconds : null,
        })),
      })),
  };
}

export function createPlanRouter(deps: {
  prisma: PrismaClient;
  verify: (token: string) => Promise<VerifiedToken>;
  planGenerator: PlanGenerator;
}): Router {
  const router = Router();
  const authenticate = createAuthMiddleware({ verify: deps.verify, prisma: deps.prisma });

  /** Absence is a 200 with null, for the same reason as the profile route. */
  router.get("/current", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    findActivePlan(deps.prisma, user.id)
      .then((plan) => {
        res.status(200).json({ plan: plan === null ? null : toPlanView(plan) });
      })
      .catch((error: unknown) => {
        next(error);
      });
  });

  router.post("/", authenticate, (req, res, next) => {
    const user = req.user;
    if (user === undefined) {
      sendError(res, 401, "UNAUTHENTICATED", "A Bearer token is required.");
      return;
    }

    createWorkoutPlan(deps.prisma, deps.planGenerator, { userId: user.id, now: new Date() })
      .then(() => findActivePlan(deps.prisma, user.id))
      .then((plan) => {
        // Non-null by construction: the plan was just created in a transaction
        // that would have thrown rather than commit nothing.
        res.status(201).json({ plan: plan === null ? null : toPlanView(plan) });
      })
      .catch((error: unknown) => {
        if (error instanceof ProfileRequiredError) {
          sendError(res, 403, "PROFILE_REQUIRED", error.message);
          return;
        }
        next(error);
      });
  });

  return router;
}
