"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert } from "../../../src/ui/Alert";
import { BackLink } from "../../../src/ui/BackLink";
import { Button } from "../../../src/ui/Button";
import { Card } from "../../../src/ui/Card";
import { ChoiceGroup } from "../../../src/ui/ChoiceGroup";
import { Field } from "../../../src/ui/Field";
import { Screen } from "../../../src/ui/Screen";

const SEXES = ["male", "female", "other", "prefer_not_to_say"] as const;
const GOALS = [
  "fat_loss",
  "muscle_gain",
  "general_fitness",
  "mobility",
  "endurance",
  "strength",
] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const SPACES = ["small_room", "large_room", "outdoor", "gym"] as const;
const EQUIPMENT = [
  "none",
  "resistance_band",
  "dumbbells",
  "kettlebell",
  "pull_up_bar",
  "yoga_mat",
  "jump_rope",
  "bench",
  "treadmill",
  "stationary_bike",
  "full_gym",
] as const;
const INJURIES = ["knee", "lower_back", "shoulder", "neck", "wrist", "ankle", "hip"] as const;
const CONDITIONS = [
  "type_2_diabetes",
  "hypertension",
  "heart_condition",
  "asthma",
  "arthritis",
  "osteoporosis",
  "pregnancy",
  "thyroid_disorder",
] as const;
const DIETARY = [
  "vegetarian",
  "non_vegetarian",
  "eggetarian",
  "jain",
  "vegan",
  "no_dairy",
  "no_gluten",
  "no_nuts",
] as const;

const STEPS = ["about", "goal", "space", "health", "food"] as const;
const TOTAL = STEPS.length;

/**
 * Where an abandoned wizard is kept. `sessionStorage`, not the database: the API
 * refuses to store an incomplete profile precisely so no consumer downstream has
 * to ask "is this half-answered?", and a draft row would reintroduce exactly
 * that state. Session scope also means a shared phone does not hand the next
 * person the last one's answers.
 */
const DRAFT_KEY = "wellness.profile.draft";

type Draft = {
  birthYear: string;
  sex: string[];
  heightCm: string;
  weightKg: string;
  goal: string[];
  level: string[];
  space: string[];
  equipment: string[];
  injuries: string[];
  conditions: string[];
  dietary: string[];
  notes: string;
};

const EMPTY: Draft = {
  birthYear: "",
  sex: [],
  heightCm: "",
  weightKg: "",
  goal: [],
  level: [],
  space: [],
  equipment: [],
  injuries: [],
  conditions: [],
  dietary: [],
  notes: "",
};

function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw === null) {
      return EMPTY;
    }
    // Spread over EMPTY rather than trusting the parse: a draft written by an
    // older version of this form is missing keys, and a missing array would
    // crash `.includes` on render.
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return EMPTY;
  }
}

/**
 * The profile as the API returns it, when there is one to edit.
 */
export type ExistingProfile = {
  birth_year: number;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: string;
  level: string;
  space: string;
  equipment: string[];
  injuries: string[];
  conditions: string[];
  dietary: string[];
  notes: string | null;
};

/** Turns a stored profile back into the form's own shape. */
function draftFrom(profile: ExistingProfile): Draft {
  return {
    birthYear: String(profile.birth_year),
    sex: profile.sex === null ? [] : [profile.sex],
    heightCm: profile.height_cm === null ? "" : String(profile.height_cm),
    weightKg: profile.weight_kg === null ? "" : String(profile.weight_kg),
    goal: [profile.goal],
    level: [profile.level],
    space: [profile.space],
    equipment: profile.equipment,
    injuries: profile.injuries,
    conditions: profile.conditions,
    dietary: profile.dietary,
    notes: profile.notes ?? "",
  };
}

export function Wizard({
  existing = null,
  rebuildPlan = false,
}: {
  existing?: ExistingProfile | null;
  rebuildPlan?: boolean;
}) {
  const t = useTranslations("onboarding");
  const tError = useTranslations("errors");
  // One translator per option group rather than one `t` with an interpolated
  // key: next-intl types its keys, and `t(`${group}.${value}`)` widens to
  // `${string}.${string}`, which it rightly refuses. Scoping each group keeps
  // the option labels checked against the message file instead of casting the
  // check away.
  const tSex = useTranslations("onboarding.sex");
  const tGoal = useTranslations("onboarding.goal");
  const tLevel = useTranslations("onboarding.level");
  const tSpace = useTranslations("onboarding.space");
  const tEquipment = useTranslations("onboarding.equipment");
  const tInjury = useTranslations("onboarding.injury");
  const tCondition = useTranslations("onboarding.condition");
  const tDietary = useTranslations("onboarding.dietary");
  const router = useRouter();

  const [step, setStep] = useState(0);
  // Seeded synchronously from the server-supplied profile so an edit opens with
  // the current answers already in place rather than blank-then-populated.
  const [draft, setDraft] = useState<Draft>(existing === null ? EMPTY : draftFrom(existing));
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Restored after mount, never during render: `sessionStorage` does not exist
  // on the server, and reading it in the initial state would make the first
  // client render disagree with the server's HTML.
  //
  // A saved profile wins over a leftover draft. The draft only exists because
  // someone abandoned intake mid-way; once a profile is stored, that draft is
  // older than the truth, and restoring it would silently revert an edit the user
  // already completed.
  useEffect(() => {
    if (existing === null) {
      setDraft(readDraft());
    }
  }, [existing]);

  function update(patch: Partial<Draft>): void {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // A full or blocked storage quota must not stop someone finishing intake.
    }
  }

  const birthYear = Number(draft.birthYear);
  const birthYearValid =
    /^\d{4}$/.test(draft.birthYear) &&
    birthYear >= 1900 &&
    birthYear <= new Date().getUTCFullYear();

  /** What each step demands before "Next" will move. */
  const stepComplete: Record<number, boolean> = {
    0: birthYearValid,
    1: draft.goal.length === 1 && draft.level.length === 1,
    2: draft.space.length === 1 && draft.equipment.length >= 1,
    3: true,
    4: true,
  };

  async function submit(): Promise<void> {
    setSaving(true);
    setError(undefined);

    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        birth_year: birthYear,
        sex: draft.sex[0] ?? null,
        height_cm: draft.heightCm.trim() === "" ? null : Number(draft.heightCm),
        weight_kg: draft.weightKg.trim() === "" ? null : Number(draft.weightKg),
        goal: draft.goal[0],
        level: draft.level[0],
        space: draft.space[0],
        equipment: draft.equipment,
        injuries: draft.injuries,
        conditions: draft.conditions,
        dietary: draft.dietary,
        notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
      }),
    });

    if (!response.ok) {
      setSaving(false);
      setError("PROFILE_SAVE_FAILED");
      return;
    }

    // Cleared only after the save is known to have landed, so a failed submit
    // leaves the answers recoverable.
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do: the profile is saved either way.
    }

    // Arrived from "rebuild my plan": editing the details WAS the rebuild, so
    // regenerate and land on the plan rather than dropping the user back home to
    // press a second button. A failed regeneration still routes to /plan, where
    // the build button is — the profile is saved either way, and stranding them
    // in the wizard would hide that.
    if (rebuildPlan) {
      await fetch("/api/plan", { method: "POST" });
      router.push("/plan");
      return;
    }
    router.push("/home");
  }

  return (
    <Screen title={existing === null ? t("title") : t("editTitle")}>
      <BackLink href={rebuildPlan ? "/plan" : "/home"}>
        {rebuildPlan ? t("backPlan") : t("backHome")}
      </BackLink>

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      <p className="text-sm font-semibold tracking-widest text-muted uppercase">
        {t("stepOf", { current: step + 1, total: TOTAL })} · {t(`steps.${STEPS[step] ?? "about"}`)}
      </p>

      <Card>
        <div className="flex flex-col gap-5">
          {step === 0 && (
            <>
              <Field
                label={t("labels.birthYear")}
                value={draft.birthYear}
                onChange={(value) => update({ birthYear: value })}
                inputMode="numeric"
                maxLength={4}
              />
              <ChoiceGroup
                legend={t("labels.sex")}
                choices={SEXES.map((value) => ({ value, label: tSex(value) }))}
                selected={draft.sex}
                onChange={(sex) => update({ sex })}
              />
              <Field
                label={t("labels.heightCm")}
                value={draft.heightCm}
                onChange={(value) => update({ heightCm: value })}
                inputMode="numeric"
                maxLength={3}
              />
              <Field
                label={t("labels.weightKg")}
                value={draft.weightKg}
                onChange={(value) => update({ weightKg: value })}
                inputMode="numeric"
                maxLength={5}
              />
            </>
          )}

          {step === 1 && (
            <>
              <ChoiceGroup
                legend={t("labels.goal")}
                choices={GOALS.map((value) => ({ value, label: tGoal(value) }))}
                selected={draft.goal}
                onChange={(goal) => update({ goal })}
              />
              <ChoiceGroup
                legend={t("labels.level")}
                choices={LEVELS.map((value) => ({ value, label: tLevel(value) }))}
                selected={draft.level}
                onChange={(level) => update({ level })}
              />
            </>
          )}

          {step === 2 && (
            <>
              <ChoiceGroup
                legend={t("labels.space")}
                choices={SPACES.map((value) => ({ value, label: tSpace(value) }))}
                selected={draft.space}
                onChange={(space) => update({ space })}
              />
              <ChoiceGroup
                legend={t("labels.equipment")}
                choices={EQUIPMENT.map((value) => ({ value, label: tEquipment(value) }))}
                selected={draft.equipment}
                onChange={(equipment) => update({ equipment })}
                multiple
              />
            </>
          )}

          {step === 3 && (
            <>
              <ChoiceGroup
                legend={t("labels.injuries")}
                choices={INJURIES.map((value) => ({ value, label: tInjury(value) }))}
                selected={draft.injuries}
                onChange={(injuries) => update({ injuries })}
                multiple
              />
              <ChoiceGroup
                legend={t("labels.conditions")}
                choices={CONDITIONS.map((value) => ({ value, label: tCondition(value) }))}
                selected={draft.conditions}
                onChange={(conditions) => update({ conditions })}
                multiple
              />
              <Field
                label={t("labels.notes")}
                value={draft.notes}
                onChange={(value) => update({ notes: value })}
                maxLength={500}
              />
              {/* FR-WRK-3: this screen is where conditions are collected, so it
                  is where the disclaimer belongs — not buried on a plan later. */}
              <p className="text-sm text-muted">{t("disclaimer")}</p>
            </>
          )}

          {step === 4 && (
            <ChoiceGroup
              legend={t("labels.dietary")}
              choices={DIETARY.map((value) => ({ value, label: tDietary(value) }))}
              selected={draft.dietary}
              onChange={(dietary) => update({ dietary })}
              multiple
            />
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {step === TOTAL - 1 ? (
          <Button
            disabled={saving || !stepComplete[step]}
            loading={saving}
            onClick={() => {
              void submit();
            }}
          >
            {saving ? t("saving") : rebuildPlan ? t("saveAndRebuild") : t("finish")}
          </Button>
        ) : (
          <Button
            disabled={!stepComplete[step]}
            onClick={() => {
              setStep(step + 1);
            }}
          >
            {t("next")}
          </Button>
        )}

        {step > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setStep(step - 1);
            }}
          >
            {t("back")}
          </Button>
        )}
      </div>
    </Screen>
  );
}
