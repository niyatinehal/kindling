"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { PANTRY_GROUPS } from "../../src/meals/mealTypes";
import type { MealSuggestion } from "../../src/meals/mealTypes";
import { Alert } from "../../src/ui/Alert";
import { BackLink } from "../../src/ui/BackLink";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { ChoiceGroup } from "../../src/ui/ChoiceGroup";
import { Field } from "../../src/ui/Field";
import { Icon, IconChip } from "../../src/ui/Icon";
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
  const [customDish, setCustomDish] = useState("");
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

  /**
   * Logs a meal, from the library or from the user's own kitchen.
   *
   * Exactly one of the two is sent: a `recipe_key` for a suggested dish, or a
   * freeform `name` for anything else. Keeping them apart is what lets a history
   * view translate the first and show the second verbatim — stuffing a typed name
   * into the key field would make "poha" ambiguous between the two.
   */
  async function logMeal(dish: { recipeKey: string } | { name: string }): Promise<void> {
    const marker = "recipeKey" in dish ? dish.recipeKey : dish.name;
    setLogged([...logged, marker]);

    const response = await fetch("/api/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "meal",
        logged_for: today(),
        status: "completed",
        recipe_key: "recipeKey" in dish ? dish.recipeKey : null,
        notes: "name" in dish ? dish.name : null,
      }),
    });

    if (!response.ok) {
      setLogged((current) => current.filter((key) => key !== marker));
      setError("TRACKING_FAILED");
      return;
    }
    if ("name" in dish) {
      setCustomDish("");
    }
  }

  return (
    <Screen title={t("title")}>
      <BackLink href="/home">{t("backHome")}</BackLink>

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      {!hasProfile && (
        <Card tone="emphasis">
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
          <div className="flex gap-3">
            <IconChip name="utensils" tone="meal" />
            <div>
              <h2 className="font-display text-xl leading-snug font-semibold text-ink">
                {t("pantryTitle")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t("pantryHint")}</p>
            </div>
          </div>

          {PANTRY_GROUPS.map((group) => (
            <ChoiceGroup
              key={group.group}
              legend={t(`groups.${group.group}` as "groups.grains")}
              choices={group.items.map((value) => ({ value, label: label(value) }))}
              selected={selected}
              onChange={setSelected}
              multiple
              layout="chips"
            />
          ))}

          <ChoiceGroup
            legend={t("slotLabel")}
            choices={SLOTS.map((value) => ({ value, label: tSlot(value) }))}
            selected={slot}
            onChange={setSlot}
            layout="chips"
          />

          <Button
            disabled={busy}
            loading={busy}
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
              <h3 className="font-display text-xl font-semibold text-ink">
                {tRecipe.has(suggestion.recipe_key)
                  ? tRecipe(suggestion.recipe_key)
                  : suggestion.recipe_key}
              </h3>
              <span className="rounded-full bg-meal-soft px-2.5 py-0.5 text-xs font-semibold text-meal">
                {tSlot(suggestion.slot as "lunch")}
              </span>
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
              <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-move-soft px-3 py-1 text-sm font-semibold text-move">
                <Icon name="check" className="size-4" />
                {t("canCookNow")}
              </p>
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

            {/*
              No suggested meal is left protein-free. A dish that clears its slot's
              target says so; one that does not names what to serve with it, rather
              than being dropped — a side dish is not a mistake.
            */}
            {suggestion.meets_protein ? (
              <p className="text-sm text-muted">{t("proteinOk")}</p>
            ) : (
              suggestion.pair_with !== null && (
                <p className="text-sm text-muted">
                  {t("pairWith", {
                    dish: tRecipe.has(suggestion.pair_with)
                      ? tRecipe(suggestion.pair_with)
                      : suggestion.pair_with,
                  })}
                </p>
              )
            )}

            <div className="mt-1">
              {logged.includes(suggestion.recipe_key) ? (
                <span className="text-sm font-semibold text-accent">{t("eaten")}</span>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void logMeal({ recipeKey: suggestion.recipe_key });
                  }}
                >
                  {t("markEaten")}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}

      {/*
        Anything the library has never heard of. Always available, not hidden
        behind a search that came up empty — most of what a family actually eats
        is not in a twenty-dish list, and a tracker that can only record dishes it
        already knows is a tracker nobody's week fits into.
      */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <IconChip name="plus" tone="meal" />
            <div>
              <h2 className="font-display text-xl leading-snug font-semibold text-ink">
                {t("customTitle")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t("customHint")}</p>
            </div>
          </div>
          <Field
            label={t("customLabel")}
            value={customDish}
            onChange={setCustomDish}
            maxLength={200}
          />
          <Button
            disabled={customDish.trim() === ""}
            onClick={() => {
              void logMeal({ name: customDish.trim() });
            }}
          >
            {t("customLog")}
          </Button>
          {logged.some((entry) => !entry.includes("_")) && (
            <p className="text-sm font-semibold text-accent">{t("customLogged")}</p>
          )}
        </div>
      </Card>

      {suggestions !== null && <p className="text-sm text-muted">{t("disclaimer")}</p>}
    </Screen>
  );
}
