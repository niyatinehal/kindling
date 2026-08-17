import type { PrismaClient, WorkoutPlan } from "../../generated/prisma/client.js";
import { toProfileView } from "../profile/toProfileView.js";
import type { PlanGenerator } from "../workouts/planGenerator.js";

export class ProfileRequiredError extends Error {
  constructor() {
    super("A wellness profile is required before a plan can be generated.");
    this.name = "ProfileRequiredError";
  }
}

export type PlanWithExercises = WorkoutPlan & {
  exercises: { dayOfWeek: number; position: number; exerciseKey: string }[];
};

/**
 * Generates a plan for a user and makes it their active one.
 *
 * Supersedes rather than deletes: an old plan is what a logged workout points at,
 * so the history has to survive regeneration (FR-WRK-5 re-evaluates weekly). The
 * supersede and the insert share a transaction because a user with two active
 * plans has no answer to "what am I doing today?", and a user with none after a
 * half-applied regeneration has lost their plan outright.
 */
export async function createWorkoutPlan(
  prisma: PrismaClient,
  generator: PlanGenerator,
  input: { userId: string; now: Date },
): Promise<WorkoutPlan> {
  const profile = await prisma.profile.findUnique({ where: { userId: input.userId } });

  // The completeness predicate from the profile slice: the API refuses to store
  // an incomplete profile, so a row existing IS the plan-ready signal. There is
  // no partial state to interrogate here.
  if (profile === null) {
    throw new ProfileRequiredError();
  }

  const draft = await generator.generate(profile, input.now);

  return prisma.$transaction(async (tx) => {
    await tx.workoutPlan.updateMany({
      where: { userId: input.userId, status: "active" },
      data: { status: "superseded" },
    });

    return tx.workoutPlan.create({
      data: {
        userId: input.userId,
        generator: draft.generator,
        // The profile as it was, so the plan stays explainable after the profile
        // changes. `toProfileView` rather than the raw row: it is already the
        // JSON-safe shape, so the Decimal weight cannot land in the column as
        // {"s":1,"e":1,...}.
        profileSnapshot: {
          ...toProfileView(profile, input.now),
          applied_exclusions: draft.appliedExclusions,
        },
        exercises: { create: draft.exercises },
      },
    });
  });
}

/** The user's current plan, with its exercises in day and position order. */
export async function findActivePlan(
  prisma: PrismaClient,
  userId: string,
): Promise<PlanWithExercises | null> {
  return prisma.workoutPlan.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: {
      exercises: { orderBy: [{ dayOfWeek: "asc" }, { position: "asc" }] },
    },
  });
}
