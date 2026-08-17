-- CreateEnum
CREATE TYPE "TrackingType" AS ENUM ('workout', 'meal', 'water', 'sleep');

-- CreateEnum
CREATE TYPE "TrackingStatus" AS ENUM ('completed', 'skipped', 'logged');

-- CreateTable
CREATE TABLE "tracking_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "TrackingType" NOT NULL,
    "status" "TrackingStatus" NOT NULL,
    "logged_for" DATE NOT NULL,
    "value" INTEGER,
    "plan_exercise_id" UUID,
    "rating" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_logs_user_id_type_logged_for_idx" ON "tracking_logs"("user_id", "type", "logged_for");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_logs_user_id_plan_exercise_id_logged_for_key" ON "tracking_logs"("user_id", "plan_exercise_id", "logged_for");

-- AddForeignKey
ALTER TABLE "tracking_logs" ADD CONSTRAINT "tracking_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_logs" ADD CONSTRAINT "tracking_logs_plan_exercise_id_fkey" FOREIGN KEY ("plan_exercise_id") REFERENCES "plan_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

