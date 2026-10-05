"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { DishArt } from "../../src/art/DishArt";
import { HeroArt } from "../../src/art/HeroArt";
import { PANTRY_GROUPS } from "../../src/meals/mealTypes";
import type {
  DishExplanation,
  MealSuggestion,
  PantryConsent,
  PantryParse,
  PhotoStatus,
} from "../../src/meals/mealTypes";
import { shrinkImage } from "../../src/meals/shrinkImage";
import { Alert } from "../../src/ui/Alert";
import { BackLink } from "../../src/ui/BackLink";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { ChoiceGroup } from "../../src/ui/ChoiceGroup";
import { Field } from "../../src/ui/Field";
import { Icon } from "../../src/ui/Icon";
import { Screen } from "../../src/ui/Screen";

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/** How often, and for how long, a photo job is polled before the screen gives up on it. */
const PHOTO_POLL_MS = 1_500;
const PHOTO_POLLS = 40;

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Today as a UTC calendar day, matching what the tracking API stores. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The meal planner: say what is in the kitchen, get dishes back.
 *
 * Two ways in, one list. The checklist is the source of truth; typing "thoda
 * atta, 2 aloo" is a shortcut that ticks items on it. The API resolves the text
 * against a synonym table and the result comes back as chips the user can untick
 * before anything is suggested — so a wrong guess costs one tap, never a wrong
 * meal. Anything it could not read is shown back as "not in our list yet" rather
 * than silently dropped.
 *
 * Dietary constraints are NOT asked here. They are on the profile, which the API
 * reads server-side, so a vegetarian cannot be shown chicken by a client that
 * forgot to send a flag.
 */
export function MealsClient({
  hasProfile,
  pantryConsent,
}: {
  hasProfile: boolean;
  pantryConsent: PantryConsent;
}) {
  const t = useTranslations("meals");
  const tError = useTranslations("errors");
  const tIngredient = useTranslations("meals.ingredients");
  const tRecipe = useTranslations("meals.recipes");
  const tSlot = useTranslations("meals.slots");
  const tCaution = useTranslations("plan.reasons");

  const [selected, setSelected] = useState<string[]>([]);
  const [pantryText, setPantryText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<PantryParse | null>(null);
  const [aiConsent, setAiConsent] = useState(pantryConsent.enabled);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [logged, setLogged] = useState<string[]>([]);
  const [customDish, setCustomDish] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const label = (key: string) => (tIngredient.has(key) ? tIngredient(key) : key);

  /**
   * Ticks what the typed text names. Added to the current selection, never
   * replacing it, so typing after ticking does not throw the ticks away.
   */
  async function readPantry(): Promise<void> {
    setParsing(true);
    setError(undefined);

    const response = await fetch("/api/meals/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: pantryText.trim() }),
    });
    const body = await readJsonBody(response);
    setParsing(false);

    if (!response.ok || typeof body !== "object" || body === null || !("recognised" in body)) {
      setError("PANTRY_PARSE_FAILED");
      return;
    }

    applyParse(body as PantryParse);
  }

  /** Shows a parse as chips and ticks what it found, whichever way it arrived. */
  function applyParse(result: PantryParse): void {
    setParsed(result);
    setSelected((current) => [...new Set([...current, ...result.recognised])]);
  }

  /**
   * Reads a photo of the fridge, groceries or a receipt. The photo is shrunk
   * on the phone first, sent once, and read as a background job this polls;
   * what comes back is the same chips a typed pantry gives, to check before
   * anything is suggested.
   */
  async function readPhoto(file: File): Promise<void> {
    setReadingPhoto(true);
    setError(undefined);

    const fail = (code: string) => {
      setReadingPhoto(false);
      setError(code);
    };

    const image = await shrinkImage(file);
    const queued = await fetch("/api/meals/photo", {
      method: "POST",
      headers: { "content-type": image.type || file.type },
      body: image,
    });
    const job = await readJsonBody(queued);
    const jobId =
      queued.ok && typeof job === "object" && job !== null && "job_id" in job
        ? String((job as { job_id: unknown }).job_id)
        : null;
    if (jobId === null) {
      fail("PHOTO_FAILED");
      return;
    }

    for (let poll = 0; poll < PHOTO_POLLS; poll++) {
      const response = await fetch(`/api/meals/photo/${encodeURIComponent(jobId)}`);
      const status = (await readJsonBody(response)) as PhotoStatus | null;
      if (!response.ok || status === null) {
        fail("PHOTO_FAILED");
        return;
      }
      if (status.status === "done") {
        setReadingPhoto(false);
        applyParse({
          recognised: status.recognised,
          unrecognised: status.unrecognised,
          source: "llm",
          degraded: false,
          parser: status.parser,
        });
        return;
      }
      if (status.status === "failed") {
        fail(status.reason === "rate_limited" ? "PHOTO_LIMIT" : "PHOTO_FAILED");
        return;
      }
      await pause(PHOTO_POLL_MS);
    }
    fail("PHOTO_FAILED");
  }

  /**
   * Asks for a "why this dish" sentence per suggestion, after the dishes are
   * already showing. Optional all the way down: no consent, a failure or a
   * sentence the API refused all just mean a card without one.
   */
  async function explain(dishes: readonly MealSuggestion[]): Promise<void> {
    const response = await fetch("/api/meals/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_keys: dishes.map((dish) => dish.recipe_key),
        on_hand: selected,
      }),
    });
    const body = await readJsonBody(response);
    if (!response.ok || typeof body !== "object" || body === null || !("explanations" in body)) {
      return;
    }
    const written = (body as { explanations: DishExplanation[] }).explanations;
    setExplanations(Object.fromEntries(written.map((entry) => [entry.recipe_key, entry.text])));
  }

  /**
   * Gives or withdraws consent to AI reading. Shown as changed straight away and
   * put back if the save fails, so the toggle never claims a consent the server
   * does not hold.
   */
  async function setAiReading(enabled: boolean): Promise<void> {
    setAiConsent(enabled);
    setError(undefined);

    const response = await fetch("/api/meals/consent", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      setAiConsent(!enabled);
      setError("PANTRY_CONSENT_FAILED");
    }
  }

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
    setExplanations({});
    if (aiConsent && parsed.length > 0) {
      void explain(parsed);
    }
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

      {/* A table of home cooking to open on, before the list of ingredients. */}
      <div className="aspect-video overflow-hidden rounded-card bg-raised">
        <HeroArt name="food" />
      </div>

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
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t("typeTitle")}</h2>
            <p className="mt-1 leading-relaxed text-muted">{t("typeHint")}</p>
          </div>
          <Field
            label={t("typeLabel")}
            value={pantryText}
            onChange={setPantryText}
            maxLength={500}
          />
          {/*
            Opt-in, off by default, and only offered when it can apply. The
            label says exactly what is sent and what is not, because this is
            the one place the app sends anything you type to an outside service.
          */}
          {pantryConsent.available && (
            <ChoiceGroup
              legend={t("aiLegend")}
              choices={[{ value: "on", label: t("aiConsent") }]}
              selected={aiConsent ? ["on"] : []}
              onChange={(next) => {
                void setAiReading(next.includes("on"));
              }}
              multiple
            />
          )}
          <Button
            variant="secondary"
            disabled={pantryText.trim() === "" || parsing}
            loading={parsing}
            onClick={() => {
              void readPantry();
            }}
          >
            {parsing ? t("typeReading") : t("typeRead")}
          </Button>

          {/*
            Photo reading rides on the same consent as typing, so it appears
            only once smarter reading is on — and only where the deployment
            has the job queue it needs. The input is a real file input inside
            its label, so it is keyboard- and screen-reader-reachable.
          */}
          {pantryConsent.photo && aiConsent && (
            <label
              className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 font-medium text-ink transition hover:bg-raised has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                readingPhoto ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                disabled={readingPhoto}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file !== undefined) {
                    void readPhoto(file);
                  }
                }}
              />
              {readingPhoto ? t("photoReading") : t("photoTake")}
            </label>
          )}

          {parsed !== null && parsed.recognised.length > 0 && (
            <ChoiceGroup
              legend={t("typeFound")}
              choices={parsed.recognised.map((value) => ({ value, label: label(value) }))}
              selected={selected}
              onChange={setSelected}
              multiple
              layout="chips"
            />
          )}
          {parsed !== null && parsed.recognised.length === 0 && (
            <p className="text-muted">{t("typeNoneFound")}</p>
          )}
          {parsed !== null && parsed.unrecognised.length > 0 && (
            <p className="text-sm text-muted">
              {t("typeUnrecognised", { items: parsed.unrecognised.join(", ") })}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t("pantryTitle")}</h2>
            <p className="mt-1 leading-relaxed text-muted">{t("pantryHint")}</p>
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
        <article
          key={suggestion.recipe_key}
          className="overflow-hidden rounded-card bg-surface shadow-card"
        >
          {/*
            The dish first, as a picture, with the meal it suits laid over its
            corner — the one fact worth reading before the name.
          */}
          <div className="relative aspect-[16/9] overflow-hidden">
            <DishArt recipe={suggestion.recipe_key} />
            <span className="absolute start-3 top-3 rounded-md bg-surface/90 px-2 py-0.5 text-xs font-medium text-ink backdrop-blur-sm">
              {tSlot(suggestion.slot as "lunch")}
            </span>
          </div>

          <div className="flex flex-col gap-2 p-5">
            <h3 className="text-lg font-semibold text-ink">
              {tRecipe.has(suggestion.recipe_key)
                ? tRecipe(suggestion.recipe_key)
                : suggestion.recipe_key}
            </h3>

            {/*
              Written by the model about a dish the rules chose, and checked
              by the API: it names only this dish's ingredients and carries no
              numbers or health claims. Labelled, because it is the one line
              on the card the app did not compute itself.
            */}
            {explanations[suggestion.recipe_key] !== undefined && (
              <p className="leading-relaxed text-ink">
                {explanations[suggestion.recipe_key]}{" "}
                <span className="text-xs text-muted">{t("aiWritten")}</span>
              </p>
            )}

            {/* §16.2: nutrition is always labelled an estimate, never a fact. */}
            <p className="text-sm text-muted">
              {t("estimate", {
                kcal: suggestion.approx_kcal,
                protein: suggestion.protein_g,
                minutes: suggestion.minutes,
              })}
            </p>

            {suggestion.missing.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent">
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
                  inline
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
        </article>
      ))}

      {/*
        Anything the library has never heard of. Always available, not hidden
        behind a search that came up empty — most of what a family actually eats
        is not in a twenty-dish list, and a tracker that can only record dishes it
        already knows is a tracker nobody's week fits into.
      */}
      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t("customTitle")}</h2>
            <p className="mt-1 leading-relaxed text-muted">{t("customHint")}</p>
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
