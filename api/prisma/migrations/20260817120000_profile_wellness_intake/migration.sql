-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "FitnessGoal" AS ENUM ('fat_loss', 'muscle_gain', 'general_fitness', 'mobility', 'endurance', 'strength');

-- CreateEnum
CREATE TYPE "FitnessLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "SpaceCategory" AS ENUM ('small_room', 'large_room', 'outdoor', 'gym');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('none', 'resistance_band', 'dumbbells', 'kettlebell', 'pull_up_bar', 'yoga_mat', 'jump_rope', 'bench', 'treadmill', 'stationary_bike', 'full_gym');

-- CreateEnum
CREATE TYPE "Injury" AS ENUM ('knee', 'lower_back', 'shoulder', 'neck', 'wrist', 'ankle', 'hip');

-- CreateEnum
CREATE TYPE "MedicalCondition" AS ENUM ('type_2_diabetes', 'hypertension', 'heart_condition', 'asthma', 'arthritis', 'osteoporosis', 'pregnancy', 'thyroid_disorder');

-- CreateEnum
CREATE TYPE "DietaryConstraint" AS ENUM ('vegetarian', 'non_vegetarian', 'eggetarian', 'jain', 'vegan', 'no_dairy', 'no_gluten', 'no_nuts');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "birth_year" INTEGER NOT NULL,
    "sex" "Sex",
    "height_cm" INTEGER,
    "weight_kg" DECIMAL(5,2),
    "goal" "FitnessGoal" NOT NULL,
    "level" "FitnessLevel" NOT NULL,
    "space" "SpaceCategory" NOT NULL,
    "equipment" "Equipment"[],
    "injuries" "Injury"[],
    "conditions" "MedicalCondition"[],
    "dietary" "DietaryConstraint"[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

