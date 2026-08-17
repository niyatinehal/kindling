import type { PrismaClient, TrackingLog } from "../../generated/prisma/client.js";
import type { TrackingStatus, TrackingType } from "../../generated/prisma/enums.js";
import { toCalendarDay, weekWindow } from "../tracking/period.js";

export type LogInput = {
  userId: string;
  type: TrackingType;
  status: TrackingStatus;
  loggedFor: Date;
  value: number | null;
  planExerciseId: string | null;
  rating: number | null;
  recipeKey: string | null;
  notes: string | null;
};

/**
 * Records one entry.
 *
 * Workout and sleep entries are UPSERTS, water entries are appends, and that
 * asymmetry is the domain rather than an inconsistency: "I drank another glass"
 * is a new fact each time, while "I did this exercise" and "I slept 7 hours" are
 * corrections to a single fact about a single day. A double-tapped tick must not
 * count twice toward adherence.
 */
export async function recordLog(prisma: PrismaClient, input: LogInput): Promise<TrackingLog> {
  const loggedFor = toCalendarDay(input.loggedFor);
  const data = {
    userId: input.userId,
    type: input.type,
    status: input.status,
    loggedFor,
    value: input.value,
    planExerciseId: input.planExerciseId,
    rating: input.rating,
    recipeKey: input.recipeKey,
    notes: input.notes,
  };

  if (input.type === "workout" && input.planExerciseId !== null) {
    // The unique index covers (userId, planExerciseId, loggedFor), so re-ticking
    // an exercise updates the one row rather than adding a second.
    return prisma.trackingLog.upsert({
      where: {
        userId_planExerciseId_loggedFor: {
          userId: input.userId,
          planExerciseId: input.planExerciseId,
          loggedFor,
        },
      },
      create: data,
      update: { status: input.status, rating: input.rating, notes: input.notes },
    });
  }

  if (input.type === "sleep") {
    // No unique index to lean on: the one above keys on planExerciseId, which is
    // null here, and Postgres treats every NULL as distinct. So the "one sleep
    // entry per day" rule is enforced by finding and updating instead.
    const existing = await prisma.trackingLog.findFirst({
      where: { userId: input.userId, type: "sleep", loggedFor },
    });
    if (existing !== null) {
      return prisma.trackingLog.update({
        where: { id: existing.id },
        data: { value: input.value, rating: input.rating, notes: input.notes },
      });
    }
  }

  return prisma.trackingLog.create({ data });
}

export type TrackingSummary = {
  from: string;
  to: string;
  water_ml: number;
  sleep_minutes: number;
  sleep_nights: number;
  workouts_completed: number;
  workouts_scheduled: number;
  workout_adherence: number | null;
  meals_logged: number;
};

/**
 * The rolling-week rollup behind the home tiles and, later, the family dashboard.
 *
 * Adherence is COMPUTED here, never stored. A stored percentage is wrong the
 * moment a plan is regenerated or a log is corrected, and FR-TRK-3 asks for a
 * figure that reflects the current plan rather than the plan that existed when
 * the number was written.
 *
 * `workout_adherence` is `null` rather than 0 when nothing is scheduled. Zero
 * would read as "you did none of your workouts" to someone who has no plan yet.
 */
export async function summarise(
  prisma: PrismaClient,
  input: { userId: string; now: Date },
): Promise<TrackingSummary> {
  const { from, to, days } = weekWindow(input.now);

  const [logs, activePlan] = await Promise.all([
    prisma.trackingLog.findMany({
      where: { userId: input.userId, loggedFor: { gte: from, lte: to } },
    }),
    prisma.workoutPlan.findFirst({
      where: { userId: input.userId, status: "active" },
      orderBy: { createdAt: "desc" },
      include: { exercises: { select: { id: true } } },
    }),
  ]);

  const sum = (type: TrackingType) =>
    logs.filter((log) => log.type === type).reduce((total, log) => total + (log.value ?? 0), 0);

  const sleepLogs = logs.filter((log) => log.type === "sleep");
  const completed = logs.filter((log) => log.type === "workout" && log.status === "completed");

  // Scheduled counts the plan's whole week, scaled to the window. The plan is a
  // repeating week, so a 7-day window sees it exactly once.
  const perWeek = activePlan?.exercises.length ?? 0;
  const scheduled = Math.round((perWeek * days) / 7);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    water_ml: sum("water"),
    sleep_minutes: sum("sleep"),
    sleep_nights: sleepLogs.length,
    workouts_completed: completed.length,
    workouts_scheduled: scheduled,
    workout_adherence:
      scheduled === 0 ? null : Math.min(100, Math.round((completed.length / scheduled) * 100)),
    meals_logged: logs.filter((log) => log.type === "meal").length,
  };
}

/** Today's workout ticks, so the plan screen can render what is already done. */
export async function todaysWorkoutLogs(
  prisma: PrismaClient,
  input: { userId: string; now: Date },
): Promise<{ planExerciseId: string; status: TrackingStatus }[]> {
  const logs = await prisma.trackingLog.findMany({
    where: {
      userId: input.userId,
      type: "workout",
      loggedFor: toCalendarDay(input.now),
      planExerciseId: { not: null },
    },
    select: { planExerciseId: true, status: true },
  });

  return logs.map((log) => ({ planExerciseId: log.planExerciseId as string, status: log.status }));
}
