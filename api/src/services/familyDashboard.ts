import type { PrismaClient } from "../../generated/prisma/client.js";
import type { DataCategory } from "../../generated/prisma/enums.js";
import { summarise } from "./trackingService.js";

/**
 * What a viewer is allowed to see about one member.
 *
 * Categories the member has hidden are ABSENT, not present-and-null. The design
 * doc is explicit about this, and the difference matters: a null field tells the
 * admin "there is a number here you may not see", which is itself a disclosure.
 * An absent field says nothing.
 */
export type MemberPanel = {
  user_id: string;
  display_name: string;
  role: string;
  /** Which categories this member shares with the family. */
  shared: DataCategory[];
  adherence_summary?: {
    workout_adherence: number | null;
    days_logged: number;
  };
  water?: { water_ml: number };
  sleep?: { sleep_minutes: number; sleep_nights: number };
  workout_detail?: { workouts_completed: number; workouts_scheduled: number };
  meal_detail?: { meals_logged: number };
};

/**
 * The admin's view of the family (PRD FR-FAM-1).
 *
 * §17 requires that "Family dashboard queries must filter at the data layer by
 * each member's VisibilitySetting — an Admin's dashboard query should be
 * structurally incapable of returning hidden fields, not just hide them in the
 * UI." So the visibility rows are read FIRST and each member's panel is assembled
 * only from categories they share. A field the member hid is never fetched into a
 * shape that could leak by a later mistake.
 *
 * An admin does NOT override `hidden`. FR-AUTH-5 gives members control of their own
 * visibility and FR-FAM-3 only stops them reducing oversight below a floor — an
 * admin able to read a hidden category would invert the trust model PRD §12 is
 * explicit about ("teens control most of their own visibility").
 *
 * The viewer always sees their own row in full: hiding your own data from yourself
 * is meaningless, and a dashboard that did would look broken.
 */
export async function familyDashboard(
  prisma: PrismaClient,
  input: { familyId: string; viewerUserId: string; now: Date },
): Promise<MemberPanel[]> {
  const memberships = await prisma.familyMembership.findMany({
    where: { familyId: input.familyId, status: "active", deletedAt: null },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    include: {
      user: { select: { id: true, displayName: true } },
      visibilitySettings: { where: { visibility: "visible" }, select: { dataCategory: true } },
    },
  });

  return Promise.all(
    memberships.map(async (membership) => {
      const isSelf = membership.userId === input.viewerUserId;
      const shared = membership.visibilitySettings.map((setting) => setting.dataCategory);
      const canSee = (category: DataCategory) => isSelf || shared.includes(category);

      const summary = await summarise(prisma, { userId: membership.userId, now: input.now });

      const panel: MemberPanel = {
        user_id: membership.userId,
        display_name: membership.user.displayName,
        role: membership.role,
        shared,
      };

      if (canSee("adherence_summary")) {
        panel.adherence_summary = {
          workout_adherence: summary.workout_adherence,
          // "Did they log anything" — the one signal the safety floor protects,
          // and deliberately coarse: it reveals engagement, not content.
          days_logged: summary.days.filter(
            (day) =>
              day.water_ml > 0 ||
              day.sleep_minutes > 0 ||
              day.workouts_completed > 0 ||
              day.meals_logged > 0,
          ).length,
        };
      }
      if (canSee("water")) {
        panel.water = { water_ml: summary.water_ml };
      }
      if (canSee("sleep")) {
        panel.sleep = { sleep_minutes: summary.sleep_minutes, sleep_nights: summary.sleep_nights };
      }
      if (canSee("workout_detail")) {
        panel.workout_detail = {
          workouts_completed: summary.workouts_completed,
          workouts_scheduled: summary.workouts_scheduled,
        };
      }
      if (canSee("meal_detail")) {
        panel.meal_detail = { meals_logged: summary.meals_logged };
      }

      return panel;
    }),
  );
}
