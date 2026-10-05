import { createHash } from "node:crypto";

import type { FamilyRole } from "../../generated/prisma/enums.js";
import type { CircuitBreaker } from "../llm/breaker.js";
import type { LlmClient } from "../llm/client.js";
import { costMicroUsd } from "../llm/pricing.js";
import { withOneRetry } from "../llm/retry.js";
import {
  checkExplanation,
  DISH_PROMPT_V1,
  DISH_PROMPT_VERSION,
  dishOutput,
  dishToolSchema,
  dishUserMessage,
} from "./dishPrompt.js";
import { mayUseModel } from "./parsePantry.js";
import { startOfUtcDay } from "./pantryStore.js";
import type { LlmCallRecord, PantryStore } from "./pantryStore.js";
import { RECIPES_BY_KEY } from "./recipeLibrary.js";
import type { Recipe } from "./recipeLibrary.js";

/** Model calls per user per UTC day for dish descriptions, separate from parsing. */
export const DAILY_DISH_EXPLAINS = 30;
/**
 * Longer than the parse budget: suggestions are already on screen, and the
 * sentences arrive into them, so nobody is waiting on a blank page.
 */
const EXPLAIN_TIMEOUT_MS = 4_000;
const EXPLAIN_BUDGET_MS = 6_000;
const MIN_RETRY_MS = 1_000;

export type DishExplanations = {
  /** In the order asked for; a dish with no sentence that passed the checks is left out. */
  explanations: { recipe_key: string; text: string }[];
  /** `none` when the model was not used at all, so the screen shows no sentences. */
  source: "llm" | "cache" | "none";
  degraded: boolean;
  generator: string;
};

/**
 * The cache key for one dish's sentence: the prompt version, the recipe, and
 * which of its ingredients are on hand. Anything else on hand does not change
 * the sentence, so it is left out, and two kitchens that overlap the same way
 * share one entry. The key says nothing about who asked.
 */
export function dishCacheKey(recipe: Recipe, onHand: ReadonlySet<string>): string {
  const used = [...recipe.core, ...recipe.optional].filter((key) => onHand.has(key)).sort();
  return createHash("sha256")
    .update(`${DISH_PROMPT_VERSION}\n${recipe.key}\n${used.join(",")}`)
    .digest("hex");
}

/**
 * Writes a short "why this dish" sentence for suggestions the rules already
 * made.
 *
 * The model only ever describes: the dishes, their order, their nutrition and
 * their cautions all come from `suggestMeals`, which this never touches. It is
 * sent each dish's ingredient list and which of those the user has — no
 * profile, no diet, no conditions — and the same consent and guards as pantry
 * parsing apply, because what is on hand came from what they typed.
 *
 * There is no fallback text. A dish whose sentence is missing, failed the
 * checks, or was never asked for simply shows without one: the card already
 * says what it uses and what it needs, from the library.
 */
export async function explainDishes(
  input: {
    recipeKeys: readonly string[];
    onHand: readonly string[];
    userId: string;
    consented: boolean;
    role: FamilyRole | undefined;
    birthYear: number | null;
    requestId: string;
  },
  deps: { llm: LlmClient; store: PantryStore; breaker: CircuitBreaker; now?: () => Date },
): Promise<DishExplanations> {
  const now = deps.now?.() ?? new Date();
  const none = (degraded: boolean): DishExplanations => ({
    explanations: [],
    source: "none",
    degraded,
    generator: DISH_PROMPT_VERSION,
  });

  if (!deps.llm.enabled || !mayUseModel(input, now)) {
    return none(false);
  }

  const onHand = new Set(input.onHand);
  const dishes = [...new Set(input.recipeKeys)]
    .map((key) => RECIPES_BY_KEY.get(key))
    .filter((recipe): recipe is Recipe => recipe !== undefined)
    .map((recipe) => ({ recipe, onHand, cacheKey: dishCacheKey(recipe, onHand) }));

  const cached = await deps.store.readDishCache(
    dishes.map((dish) => dish.cacheKey),
    now,
  );
  const texts = new Map<string, string>();
  for (const dish of dishes) {
    const text = cached.get(dish.cacheKey);
    if (text !== undefined) texts.set(dish.recipe.key, text);
  }

  const missing = dishes.filter((dish) => !texts.has(dish.recipe.key));
  const answer = (source: DishExplanations["source"], degraded: boolean): DishExplanations => ({
    explanations: dishes
      .filter((dish) => texts.has(dish.recipe.key))
      .map((dish) => ({ recipe_key: dish.recipe.key, text: texts.get(dish.recipe.key) ?? "" })),
    source: texts.size === 0 ? "none" : source,
    degraded,
    generator: DISH_PROMPT_VERSION,
  });

  const started = Date.now();
  const record = (
    outcome: LlmCallRecord["outcome"],
    details: Partial<Pick<LlmCallRecord, "inputTokens" | "outputTokens" | "costMicroUsd">> & {
      latencyMs?: number;
    } = {},
  ) =>
    deps.store.recordCall({
      userId: input.userId,
      feature: "dish_explain",
      model: deps.llm.model,
      promptVersion: DISH_PROMPT_VERSION,
      outcome,
      inputTokens: details.inputTokens ?? null,
      outputTokens: details.outputTokens ?? null,
      costMicroUsd: details.costMicroUsd ?? null,
      latencyMs: details.latencyMs ?? Date.now() - started,
      requestId: input.requestId,
    });

  if (missing.length === 0) {
    await record("cache_hit");
    return answer("cache", false);
  }

  const usedToday = await deps.store.modelCallsSince(
    input.userId,
    "dish_explain",
    startOfUtcDay(now),
  );
  if (usedToday >= DAILY_DISH_EXPLAINS) {
    await record("rate_limited");
    return answer("cache", true);
  }
  if (deps.breaker.isOpen()) {
    await record("breaker_open");
    return answer("cache", true);
  }

  const keys = missing.map((dish) => dish.recipe.key);
  const output = dishOutput(keys);
  const result = await withOneRetry(
    async (timeoutMs) => {
      const attempt = await deps.llm.extract({
        system: DISH_PROMPT_V1,
        user: dishUserMessage(missing),
        schema: dishToolSchema(keys),
        validate: (raw) => output.parse(raw),
        timeoutMs,
      });
      if (attempt.ok) {
        deps.breaker.recordSuccess();
        await record("ok", {
          inputTokens: attempt.usage.inputTokens,
          outputTokens: attempt.usage.outputTokens,
          costMicroUsd: costMicroUsd(attempt.model, attempt.usage),
          latencyMs: attempt.latencyMs,
        });
      } else {
        if (attempt.reason === "timeout" || attempt.reason === "provider_error") {
          deps.breaker.recordFailure();
        }
        if (attempt.reason !== "disabled") {
          await record(attempt.reason, { latencyMs: attempt.latencyMs });
        }
      }
      return attempt;
    },
    { timeoutMs: EXPLAIN_TIMEOUT_MS, totalMs: EXPLAIN_BUDGET_MS, minRetryMs: MIN_RETRY_MS },
  );

  if (!result.ok) {
    return answer("cache", true);
  }

  // Each sentence is checked on its own, and a failing one is dropped rather
  // than the whole answer: one dish described badly is no reason to lose the
  // other four.
  const fresh: { cacheKey: string; recipeKey: string; text: string }[] = [];
  for (const dish of missing) {
    const written = result.value.explanations.find((e) => e.recipe_key === dish.recipe.key);
    if (written !== undefined && checkExplanation(dish.recipe, written.text)) {
      const text = written.text.trim();
      texts.set(dish.recipe.key, text);
      fresh.push({ cacheKey: dish.cacheKey, recipeKey: dish.recipe.key, text });
    }
  }
  if (fresh.length > 0) {
    await deps.store.writeDishCache(
      fresh.map((entry) => ({ ...entry, generator: DISH_PROMPT_VERSION })),
      now,
    );
  }

  return answer("llm", false);
}
