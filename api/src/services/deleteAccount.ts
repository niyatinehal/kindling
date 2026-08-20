import type { PrismaClient } from "../../generated/prisma/client.js";

export type DeleteAccountResult =
  { deleted: true } | { deleted: false; reason: "family_needs_admin" };

/**
 * Erases one person, for real.
 *
 * A soft delete would be the wrong shape here even though the schema has
 * `deletedAt` everywhere else. Those flags exist so a removed family member
 * stops appearing without losing the history the family's own numbers are
 * built from. An erasure request is a different thing: every medical
 * condition, weight and logged figure has to actually leave the table it is
 * in, or the privacy page is describing something the code does not do.
 *
 * The order below is not a style choice — every foreign key into `users` is
 * ON DELETE RESTRICT, deliberately (see 20260814160435_auth_fk_restrict), so
 * the row cannot go until everything pointing at it has. It runs in one
 * transaction because a half-deleted account is worse than either outcome:
 * the person believes they are gone and their tracking history is still here.
 *
 * What this does NOT remove is the Supabase `auth.users` row, which holds the
 * email or phone number used to sign in. Deleting that needs the service role
 * key, which `render.yaml` deliberately does not give this service — the
 * comment there is explicit that only the seed should ever hold it. So the
 * health data goes and the sign-in identity remains, and the caller is told
 * exactly that rather than being allowed to assume otherwise.
 */
export async function deleteAccount(
  prisma: PrismaClient,
  input: { userId: string },
): Promise<DeleteAccountResult> {
  return prisma.$transaction(async (tx) => {
    const memberships = await tx.familyMembership.findMany({
      where: { userId: input.userId, deletedAt: null },
      select: { familyId: true, role: true, status: true },
    });

    // Leaving a household with members and no admin strands them: no invites,
    // no dashboard, and nobody able to appoint a replacement. The caller is
    // told to hand over first rather than discovering it afterwards.
    for (const membership of memberships) {
      if (membership.role !== "admin" || membership.status !== "active") continue;

      const others = await tx.familyMembership.count({
        where: {
          familyId: membership.familyId,
          status: "active",
          deletedAt: null,
          userId: { not: input.userId },
        },
      });
      if (others === 0) continue;

      const otherAdmins = await tx.familyMembership.count({
        where: {
          familyId: membership.familyId,
          role: "admin",
          status: "active",
          deletedAt: null,
          userId: { not: input.userId },
        },
      });
      if (otherAdmins === 0) {
        return { deleted: false, reason: "family_needs_admin" };
      }
    }

    await tx.trackingLog.deleteMany({ where: { userId: input.userId } });

    // Exercises before plans: plan_exercises is keyed to the plan, and another
    // member's log may still reference one, which its ON DELETE SET NULL
    // handles.
    const plans = await tx.workoutPlan.findMany({
      where: { userId: input.userId },
      select: { id: true },
    });
    await tx.planExercise.deleteMany({ where: { planId: { in: plans.map((plan) => plan.id) } } });
    await tx.workoutPlan.deleteMany({ where: { userId: input.userId } });

    await tx.profile.deleteMany({ where: { userId: input.userId } });

    // Both sides. Consent is self-granted everywhere today (registerUser.ts
    // sets grantedByUserId to the user's own id), but the column allows
    // another person and the foreign key restricts on both, so covering both
    // is what keeps this correct if that ever changes.
    await tx.consentRecord.deleteMany({
      where: { OR: [{ userId: input.userId }, { grantedByUserId: input.userId }] },
    });

    await tx.familyInvite.deleteMany({ where: { createdByUserId: input.userId } });

    // Visibility settings go with the membership — that relation is the one
    // cascade in the schema.
    await tx.familyMembership.deleteMany({ where: { userId: input.userId } });

    // Any household this person created that now has nobody in it. It cannot
    // be left behind: families.created_by_user_id restricts too.
    const created = await tx.family.findMany({
      where: { createdByUserId: input.userId },
      select: { id: true },
    });
    for (const family of created) {
      const remaining = await tx.familyMembership.count({
        where: { familyId: family.id, deletedAt: null },
      });
      if (remaining === 0) {
        await tx.familyInvite.deleteMany({ where: { familyId: family.id } });
        await tx.family.delete({ where: { id: family.id } });
      }
    }

    await tx.user.delete({ where: { id: input.userId } });

    return { deleted: true };
  });
}
