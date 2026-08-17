"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { PANTRY_GROUPS } from "../../src/meals/mealTypes";
import type { MealSuggestion } from "../../src/meals/mealTypes";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { ChoiceGroup } from "../../src/ui/ChoiceGroup";
import { Screen } from "../../src/ui/Screen";

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/** Today as a UTC calendar day, matching what the tracking API stores. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The meal planner: tick what is in the kitchen, get dishes back.
 *
 * The pantry is a checklist rather than a text box. FR-MEAL-1 allows either, and
 * the list is the half that works without a model — "atta", "wheat flour" and
 * "chakki fresh atta" are one ingredient, and resolving that from prose needs a
 * synonym table or an LLM. Ticking is also faster than typing on a phone.
 *
 * Dietary constraints are NOT asked here. They are on the profile, which the API
 * reads server-side, so a vegetarian cannot be shown chicken by a client that
 * forgot to send a flag.
 */
export function MealsClient({ hasProfile }: { hasProfile: boolean }) {
  const t = useTranslations("meals");
  const tError = useTranslations("errors");
  const tIngredient = useTranslations("meals.ingredients");
  const tRecipe = useTranslations("meals.recipes");
  const tSlot = useTranslations("meals.slots");
  const tCaution = useTranslations("plan.reasons");

  const [selected, setSelected] = useState<string[]>([]);
  const [slot, setSlot] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const label = (key: string) => (tIngredient.has(key) ? tIngredient(key) : key);

  async function suggest(): Promise<void> {
    setBusy(true);
    setError(undefined);

    const response = await fetch("/api/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredients: selected, slot: slot[0] ?? null }),
    });
    const body = await readJsonBody(response);
    setBusy(false);

    if (!response.ok) {
      setError("MEAL_SUGGEST_FAILED");
      return;
    }

    const parsed =
      typeof body === "object" && body !== null && "suggestions" in body
        ? (body as { suggestions: MealSuggestion[] }).suggestions
        : [];
    setSuggestions(parsed);
  }

  /** Marks a dish eaten — a meal tracking log, so it counts toward adherence. */
  async function markEaten(recipeKey: string): Promise<void> {
    setLogged([...logged, recipeKey]);

    const response = await fetch("/api/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "meal",
        logged_for: today(),
        status: "completed",
        notes: recipeKey,
      }),
    });

    if (!response.ok) {
      setLogged((current) => current.filter((key) => key !== recipeKey));
      setError("TRACKING_FAILED");
    }
  }

  return (
    <Screen title={t("title")}>
      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      {!hasProfile && (
        <Card tone="ink">
          {/*
            Suggestions still work without a profile — an unconstrained pantry
            match is a reasonable answer. But without one there are no dietary
            constraints to respect, so say that rather than quietly ignoring them.
          */}
          <p className="text-lg leading-relaxed">{t("noProfileNote")}</p>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
              {t("pantryTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("pantryHint")}</p>
          </div>

          {PANTRY_GROUPS.map((group) => (
            <ChoiceGroup
              key={group.group}
              legend={t(`groups.${group.group}` as "groups.grains")}
              choices={group.items.map((value) => ({ value, label: label(value) }))}
              selected={selected}
              onChange={setSelected}
              multiple
            />
          ))}

          <ChoiceGroup
            legend={t("slotLabel")}
            choices={SLOTS.map((value) => ({ value, label: tSlot(value) }))}
            selected={slot}
            onChange={setSlot}
          />

          <Button
            disabled={busy}
            onClick={() => {
              void suggest();
            }}
          >
            {busy ? t("suggesting") : t("suggest")}
          </Button>
        </div>
      </Card>

      {suggestions !== null && suggestions.length === 0 && (
        <Card>
          <p className="text-muted">{t("noneFound")}</p>
        </Card>
      )}

      {suggestions?.map((suggestion) => (
        <Card key={suggestion.recipe_key}>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">
                {tRecipe.has(suggestion.recipe_key)
                  ? tRecipe(suggestion.recipe_key)
                  : suggestion.recipe_key}
              </h3>
              <span className="text-sm text-muted">{tSlot(suggestion.slot as "lunch")}</span>
            </div>

            {/* §16.2: nutrition is always labelled an estimate, never a fact. */}
            <p className="text-sm text-muted">
              {t("estimate", {
                kcal: suggestion.approx_kcal,
                protein: suggestion.protein_g,
                minutes: suggestion.minutes,
              })}
            </p>

            {suggestion.missing.length === 0 ? (
              <p className="text-sm font-medium text-accent">{t("canCookNow")}</p>
            ) : (
              <p className="text-sm text-muted">
                {t("needsMore", {
                  items: suggestion.missing.map(label).join(", "),
                })}
              </p>
            )}

            {suggestion.cautions.length > 0 && (
              <p className="text-sm text-muted">
                {t("caution", {
                  reasons: suggestion.cautions
                    .map((reason) => (tCaution.has(reason) ? tCaution(reason) : reason))
                    .join(", "),
                })}
              </p>
            )}

            <div className="mt-1">
              {logged.includes(suggestion.recipe_key) ? (
                <span className="text-sm font-semibold text-accent">{t("eaten")}</span>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void markEaten(suggestion.recipe_key);
                  }}
                >
                  {t("markEaten")}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}

      {suggestions !== null && <p className="text-sm text-muted">{t("disclaimer")}</p>}
    </Screen>
  );
}
