import type { PrismaClient, Profile } from "../../generated/prisma/client.js";
import type {
  DietaryConstraint,
  Equipment,
  FitnessGoal,
  FitnessLevel,
  Injury,
  MedicalCondition,
  Sex,
  SpaceCategory,
} from "../../generated/prisma/enums.js";

/**
 * Every optional field is `| null` rather than optional. PUT is a full replace:
 * a user who clears their weight sends `null`, and the row must end up with
 * `null` — an absent key that quietly left the old value in place would make
 * deleting a measurement impossible. Forcing the caller to name a value for
 * every field is what makes that hard to get wrong.
 */
export type ProfileInput = {
  userId: string;
  birthYear: number;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: FitnessGoal;
  level: FitnessLevel;
  space: SpaceCategory;
  equipment: Equipment[];
  injuries: Injury[];
  conditions: MedicalCondition[];
  dietary: DietaryConstraint[];
  notes: string | null;
};

/**
 * Creates or replaces the caller's profile. Keyed on `userId`, which is unique,
 * so this is idempotent: the onboarding wizard submitting twice (a double tap, a
 * retried request) leaves one row, not two.
 */
export async function upsertProfile(prisma: PrismaClient, input: ProfileInput): Promise<Profile> {
  const { userId, ...fields } = input;

  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
  });
}
