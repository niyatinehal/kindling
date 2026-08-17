-- CreateEnum
CREATE TYPE "InvitableRole" AS ENUM ('adult', 'child', 'elderly');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "DataCategory" AS ENUM ('adherence_summary', 'weight', 'workout_detail', 'meal_detail', 'sleep', 'water', 'medical_conditions');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('visible', 'hidden');

-- CreateTable
CREATE TABLE "family_invites" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "invited_role" "InvitableRole" NOT NULL,
    "invite_code" TEXT NOT NULL,
    "invited_contact" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "accepted_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_settings" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "data_category" "DataCategory" NOT NULL,
    "visibility" "Visibility" NOT NULL,
    "is_locked_by_safety_floor" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visibility_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "family_invites_invite_code_key" ON "family_invites"("invite_code");

-- CreateIndex
CREATE INDEX "family_invites_family_id_status_idx" ON "family_invites"("family_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "visibility_settings_membership_id_data_category_key" ON "visibility_settings"("membership_id", "data_category");

-- AddForeignKey
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_settings" ADD CONSTRAINT "visibility_settings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "family_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

