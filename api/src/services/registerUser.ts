import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient, User } from "../../generated/prisma/client.js";
import type { ConsentType, Locale } from "../../generated/prisma/enums.js";

export type RegisterUserInput = {
  authUserId: string;
  email?: string;
  phone?: string;
  displayName: string;
  locale: Locale;
  consents: { consentType: ConsentType; policyVersion: string }[];
};

/**
 * Creates the domain user and its consent records atomically. Idempotent on
 * authUserId so a client retrying after a dropped response is not stuck: the
 * Supabase account already exists and cannot be created twice.
 */
export async function registerUser(prisma: PrismaClient, input: RegisterUserInput): Promise<User> {
  const existing = await prisma.user.findFirst({
    where: { authUserId: input.authUserId, deletedAt: null },
  });
  if (existing !== null) {
    // A repeat call with the same authUserId returns the existing row as-is
    // and silently discards any changed `displayName`, `locale`, or
    // `consents` in this call's input. Registration is not an update path.
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authUserId: input.authUserId,
          displayName: input.displayName,
          locale: input.locale,
          ...(input.email !== undefined && { email: input.email }),
          ...(input.phone !== undefined && { phone: input.phone }),
        },
      });

      // Deliberately validated *inside* the transaction, after the user row is
      // created: a failure here must undo the user creation via the same
      // ROLLBACK, not merely prevent a write that hadn't happened yet. A
      // pre-transaction check would make the rollback test pass even against a
      // non-atomic implementation, since the invalid path would never reach a
      // database write at all.
      for (const consent of input.consents) {
        if (consent.policyVersion.trim() === "") {
          throw new Error("every consent must record the policy version it was granted under");
        }
      }

      if (input.consents.length > 0) {
        await tx.consentRecord.createMany({
          data: input.consents.map((consent) => ({
            userId: user.id,
            grantedByUserId: user.id,
            consentType: consent.consentType,
            policyVersion: consent.policyVersion,
          })),
        });
      }

      return user;
    });
  } catch (error) {
    // The existence check above is not inside this transaction, so two
    // concurrent calls for the same authUserId can both pass it: one wins
    // the insert, the other hits the unique constraint on auth_user_id and
    // lands here. The same thing happens for a single caller retrying
    // against a *soft-deleted* row — the check filters `deletedAt: null`,
    // so it finds nothing, but authUserId is unique regardless of soft
    // delete and the insert still collides. Either way the row now exists;
    // re-read it and return it so registration stays idempotent instead of
    // surfacing a 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      error.message.includes("auth_user_id")
    ) {
      const raced = await prisma.user.findFirst({ where: { authUserId: input.authUserId } });
      if (raced !== null) {
        return raced;
      }
    }
    throw error;
  }
}
