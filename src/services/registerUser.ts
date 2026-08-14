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
    return existing;
  }

  return prisma.$transaction(async (tx) => {
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
}
