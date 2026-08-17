import type { Family, FamilyInvite, PrismaClient } from "../../generated/prisma/client.js";
import type { FamilyRole, InvitableRole } from "../../generated/prisma/enums.js";
import { generateInviteCode } from "../families/inviteCode.js";
import { defaultVisibilityFor } from "../families/visibilityDefaults.js";

export class AlreadyInFamilyError extends Error {
  constructor() {
    super("This account already belongs to a family.");
    this.name = "AlreadyInFamilyError";
  }
}

export class InviteUnusableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteUnusableError";
  }
}

export class LastAdminError extends Error {
  constructor() {
    super("A family must keep at least one admin.");
    this.name = "LastAdminError";
  }
}

/** How long an invite stays usable. Long enough to pass on, short enough to matter. */
const INVITE_TTL_DAYS = 7;

async function hasActiveMembership(prisma: PrismaClient, userId: string): Promise<boolean> {
  const existing = await prisma.familyMembership.findFirst({
    where: { userId, status: "active", deletedAt: null },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Creates a family and makes the caller its admin.
 *
 * One transaction covering three writes, because each one alone is a broken
 * state: a family with no members is unreachable, a membership with no
 * visibility rows leaves a dashboard query undefined (the design doc rules out
 * an implicit fallback), and a family whose creator is not an admin can never be
 * administered.
 */
export async function createFamily(
  prisma: PrismaClient,
  input: { userId: string; name: string; now: Date },
): Promise<Family> {
  if (await hasActiveMembership(prisma, input.userId)) {
    throw new AlreadyInFamilyError();
  }

  return prisma.$transaction(async (tx) => {
    const family = await tx.family.create({
      data: { name: input.name, createdByUserId: input.userId },
    });

    const membership = await tx.familyMembership.create({
      data: {
        familyId: family.id,
        userId: input.userId,
        role: "admin",
        joinedAt: input.now,
      },
    });

    await tx.visibilitySetting.createMany({
      data: defaultVisibilityFor("admin").map((setting) => ({
        membershipId: membership.id,
        ...setting,
      })),
    });

    return family;
  });
}

/**
 * Issues an invite. The role is `InvitableRole`, so `admin` cannot be conferred
 * here at all — the type, not a check, is what prevents escalation by invite.
 */
export async function createInvite(
  prisma: PrismaClient,
  input: {
    familyId: string;
    createdByUserId: string;
    invitedRole: InvitableRole;
    invitedContact: string | null;
    now: Date;
  },
): Promise<FamilyInvite> {
  const expiresAt = new Date(input.now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  return prisma.familyInvite.create({
    data: {
      familyId: input.familyId,
      createdByUserId: input.createdByUserId,
      invitedRole: input.invitedRole,
      invitedContact: input.invitedContact,
      inviteCode: generateInviteCode(),
      expiresAt,
    },
  });
}

/**
 * Redeems an invite and joins its family.
 *
 * Every rejection is deliberately the same message to the caller: a code that is
 * revoked, already used, expired, or simply wrong all answer identically, so the
 * endpoint cannot be used to discover which codes exist.
 *
 * Expiry is checked here AND flipped to `expired` in the same transaction, so a
 * lapsed invite stops being pending the first time anyone touches it rather than
 * waiting on a sweeper that does not exist yet.
 */
export async function acceptInvite(
  prisma: PrismaClient,
  input: { userId: string; code: string; now: Date },
): Promise<{ familyId: string; role: FamilyRole }> {
  if (await hasActiveMembership(prisma, input.userId)) {
    throw new AlreadyInFamilyError();
  }

  const invite = await prisma.familyInvite.findUnique({ where: { inviteCode: input.code } });

  if (invite === null || invite.status !== "pending") {
    throw new InviteUnusableError("That invite code cannot be used.");
  }

  // Marked expired OUTSIDE the accept transaction, deliberately. Doing it inside
  // and then throwing rolls the flip back with everything else, so a lapsed code
  // would stay `pending` forever — which is exactly the bug the test caught.
  if (invite.expiresAt.getTime() <= input.now.getTime()) {
    await prisma.familyInvite.updateMany({
      where: { id: invite.id, status: "pending" },
      data: { status: "expired" },
    });
    throw new InviteUnusableError("That invite code cannot be used.");
  }

  return prisma.$transaction(async (tx) => {
    // Compare-and-swap, not read-then-write: the `status: "pending"` in the WHERE
    // is what makes the code single-use under concurrency. Two simultaneous
    // redemptions both match at most once, and the loser's count is 0.
    const claimed = await tx.familyInvite.updateMany({
      where: { id: invite.id, status: "pending" },
      data: { status: "accepted", acceptedByUserId: input.userId },
    });
    if (claimed.count !== 1) {
      throw new InviteUnusableError("That invite code cannot be used.");
    }

    // Upsert, not create. Removal is a status transition, so a previously
    // removed member still has a row and `@@unique([familyId, userId])` would
    // reject a second one — a rejoin has to revive the old membership.
    const membership = await tx.familyMembership.upsert({
      where: { familyId_userId: { familyId: invite.familyId, userId: input.userId } },
      create: {
        familyId: invite.familyId,
        userId: input.userId,
        role: invite.invitedRole,
        joinedAt: input.now,
      },
      update: {
        role: invite.invitedRole,
        status: "active",
        joinedAt: input.now,
        deletedAt: null,
      },
    });

    // Reset rather than merge: the role may differ from last time, which changes
    // which categories are floor-locked. Reviving stale sharing choices silently
    // would also re-share data the member last saw hidden.
    await tx.visibilitySetting.deleteMany({ where: { membershipId: membership.id } });
    await tx.visibilitySetting.createMany({
      data: defaultVisibilityFor(invite.invitedRole).map((setting) => ({
        membershipId: membership.id,
        ...setting,
      })),
    });

    return { familyId: invite.familyId, role: invite.invitedRole as FamilyRole };
  });
}

export async function listMembers(prisma: PrismaClient, familyId: string) {
  return prisma.familyMembership.findMany({
    where: { familyId, deletedAt: null },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    include: { user: { select: { id: true, displayName: true } } },
  });
}

/**
 * Changes a member's role.
 *
 * Refuses to remove the family's last admin. Without this an admin can demote
 * themselves and lock the family out of its own administration permanently —
 * there is no route back, because every route that could fix it is admin-guarded.
 */
export async function changeMemberRole(
  prisma: PrismaClient,
  input: { familyId: string; userId: string; role: FamilyRole },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const membership = await tx.familyMembership.findFirst({
      where: { familyId: input.familyId, userId: input.userId, status: "active", deletedAt: null },
    });

    if (membership === null) {
      throw new InviteUnusableError("That member is not in this family.");
    }

    if (membership.role === "admin" && input.role !== "admin") {
      const admins = await tx.familyMembership.count({
        where: { familyId: input.familyId, role: "admin", status: "active", deletedAt: null },
      });
      if (admins <= 1) {
        throw new LastAdminError();
      }
    }

    await tx.familyMembership.update({
      where: { id: membership.id },
      data: { role: input.role },
    });
  });
}

/**
 * Removes a member by status transition, never by deletion — their logs, plans
 * and consent records still reference them, and an audit has to be able to show
 * that they were once here.
 */
export async function removeMember(
  prisma: PrismaClient,
  input: { familyId: string; userId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const membership = await tx.familyMembership.findFirst({
      where: { familyId: input.familyId, userId: input.userId, status: "active", deletedAt: null },
    });

    if (membership === null) {
      throw new InviteUnusableError("That member is not in this family.");
    }

    if (membership.role === "admin") {
      const admins = await tx.familyMembership.count({
        where: { familyId: input.familyId, role: "admin", status: "active", deletedAt: null },
      });
      if (admins <= 1) {
        throw new LastAdminError();
      }
    }

    await tx.familyMembership.update({
      where: { id: membership.id },
      data: { status: "removed" },
    });
  });
}
