-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('active', 'superseded');

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'active',
    "generator" TEXT NOT NULL,
    "profile_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_exercises" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "exercise_key" TEXT NOT NULL,
    "sets" INTEGER,
    "reps" INTEGER,
    "duration_seconds" INTEGER,
    "rest_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_plans_user_id_status_idx" ON "workout_plans"("user_id", "status");

-- CreateIndex
CREATE INDEX "plan_exercises_plan_id_day_of_week_idx" ON "plan_exercises"("plan_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "plan_exercises_plan_id_day_of_week_position_key" ON "plan_exercises"("plan_id", "day_of_week", "position");

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

