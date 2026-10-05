import type { FamilyRole } from "../../generated/prisma/enums.js";
import type { CircuitBreaker } from "../llm/breaker.js";
import type { LlmClient, LlmResult } from "../llm/client.js";
import { costMicroUsd } from "../llm/pricing.js";
import { withOneRetry } from "../llm/retry.js";
import { ageFromBirthYear } from "../profile/toProfileView.js";
import {
  PANTRY_PROMPT_V1,
  PANTRY_PROMPT_VERSION,
  PANTRY_RESPONSE_SCHEMA,
  pantryOutput,
  pantryUserMessage,
  tidyPantryOutput,
} from "./pantryPrompt.js";
import type { PantryOutput } from "./pantryPrompt.js";
import { pantryCacheKey, startOfUtcDay } from "./pantryStore.js";
import type { LlmCallRecord, PantryStore } from "./pantryStore.js";
import { ALL_INGREDIENTS } from "./recipeLibrary.js";
import type { Ingredient } from "./recipeLibrary.js";
import { parseWithSynonyms, SYNONYM_PARSER } from "./synonyms.js";

export type PantrySource = "llm" | "cache" | "synonyms";

export type PantryParse = {
  /** Deduplicated keys, each one in `ALL_INGREDIENTS`. */
  recognised: Ingredient[];
  /** Phrases that map to nothing, shown back as "not in our list yet". */
  unrecognised: string[];
  source: PantrySource;
  /** True only when a model was tried and failed, so the synonym table answered. */
  degraded: boolean;
  /** Versioned like `rules@1`, so a stored result can be traced to what produced it. */
  parser: string;
};

/** Per model call. A second call only follows a fast failure, never a slow one. */
export const LLM_TIMEOUT_MS = 2_500;
/** The whole parse, retry included, so the screen answers in about three seconds. */
export const PARSE_BUDGET_MS = 3_000;
/** Below this, a retry has too little time left to be worth starting. */
const MIN_RETRY_MS = 500;

/**
 * The age at which someone may consent for themselves. Only the birth YEAR is
 * stored, so a year difference of exactly 18 could still be a 17-year-old;
 * anyone who might be under this age is treated as though they are.
 */
export const ADULT_AGE = 18;

/**
 * Whether this account is one the model must never see text from: a child
 * member of a family, or anyone whose profile says they may be a minor. Both
 * facts come from the database on every request, never from the client.
 */
export function isGuardedAccount(
  caller: { role: FamilyRole | undefined; birthYear: number | null },
  now: Date = new Date(),
): boolean {
  if (caller.role === "child") {
    return true;
  }
  return caller.birthYear !== null && ageFromBirthYear(caller.birthYear, now) <= ADULT_AGE;
}

/**
 * Whether this person's text may go to the model at all. Consent is opt-in and
 * off by default, and a guarded account never uses the model whatever its flag
 * says.
 */
export function mayUseModel(
  caller: { consented: boolean; role: FamilyRole | undefined; birthYear: number | null },
  now: Date = new Date(),
): boolean {
  return caller.consented && !isGuardedAccount(caller, now);
}

/** Model parses per user per UTC day. Over it, the synonym table answers. */
export const DAILY_MODEL_PARSES = 30;

export type ParsePantryDeps = {
  llm: LlmClient;
  store: PantryStore;
  breaker: CircuitBreaker;
  /** The clock, for the daily limit and cache expiry. Injected so tests can pin it. */
  now?: () => Date;
};

type Attempt = LlmResult<PantryOutput>;

/**
 * Asks the model, with the retry policy: one more attempt after a 5xx or a
 * dropped connection, never after a timeout, and only while enough of the
 * overall budget is left. `onAttempt` sees every attempt, so each one can be
 * recorded and counted. Shared by the request path and the eval script, so
 * the eval measures exactly what users get.
 */
export async function askModel(
  text: string,
  llm: LlmClient,
  onAttempt: (result: Attempt) => Promise<void> | void = () => undefined,
): Promise<Attempt> {
  return withOneRetry(
    async (timeoutMs) => {
      const result = await llm.extract({
        system: PANTRY_PROMPT_V1,
        user: pantryUserMessage(text),
        schema: PANTRY_RESPONSE_SCHEMA,
        validate: (raw) => pantryOutput.parse(raw),
        timeoutMs,
      });
      await onAttempt(result);
      return result;
    },
    { timeoutMs: LLM_TIMEOUT_MS, totalMs: PARSE_BUDGET_MS, minRetryMs: MIN_RETRY_MS },
  );
}

/**
 * Turns free-text pantry input into ingredient keys for the confirm step.
 *
 * The order, for a caller who may use the model: the shared cache, then the
 * daily limit, then the circuit breaker, then the model. The synonym table
 * answers in every other case — not consented, a child or minor, the kill
 * switch off, over the limit, the breaker open, a timeout, a provider error, or
 * output that fails validation. So this never fails because of a model: the
 * worst case is the table's answer with `degraded: true`. Either way the result
 * is only a list the user confirms as chips, so a wrong parse costs one tap
 * rather than a wrong meal.
 *
 * Every step that involved the model, or deliberately skipped it, leaves an
 * `LlmCall` row of numbers and an outcome. The text itself is never stored or
 * logged.
 */
export async function parsePantry(
  input: {
    text: string;
    userId: string;
    consented: boolean;
    role: FamilyRole | undefined;
    /** From the stored profile; null when there is none. */
    birthYear: number | null;
    requestId: string;
  },
  deps: ParsePantryDeps,
): Promise<PantryParse> {
  const now = deps.now?.() ?? new Date();
  if (!deps.llm.enabled || !mayUseModel(input, now)) {
    return fromSynonyms(input.text, false);
  }

  const started = Date.now();
  const record = (
    outcome: LlmCallRecord["outcome"],
    details: Partial<
      Pick<LlmCallRecord, "inputTokens" | "outputTokens" | "costMicroUsd" | "model">
    > & {
      latencyMs?: number;
    } = {},
  ) =>
    deps.store.recordCall({
      userId: input.userId,
      feature: "pantry_parse",
      // The model that answered, when one did; with a fallback chain that is
      // not knowable from the client alone.
      model: details.model ?? deps.llm.model,
      promptVersion: PANTRY_PROMPT_VERSION,
      outcome,
      inputTokens: details.inputTokens ?? null,
      outputTokens: details.outputTokens ?? null,
      costMicroUsd: details.costMicroUsd ?? null,
      latencyMs: details.latencyMs ?? Date.now() - started,
      requestId: input.requestId,
    });

  const textHash = pantryCacheKey(input.text, PANTRY_PROMPT_VERSION);
  const cached = await deps.store.readCache(textHash, now);
  if (cached !== null) {
    await record("cache_hit");
    return {
      // The vocabulary can shrink after an answer was cached; a key that has
      // left it must not reach the client as though it were still valid.
      recognised: cached.recognised.filter(isIngredient),
      unrecognised: cached.unrecognised,
      source: "cache",
      degraded: false,
      parser: PANTRY_PROMPT_VERSION,
    };
  }

  const usedToday = await deps.store.modelCallsSince(
    input.userId,
    "pantry_parse",
    startOfUtcDay(now),
  );
  if (usedToday >= DAILY_MODEL_PARSES) {
    await record("rate_limited");
    return degradedTo("rate_limited", input);
  }

  if (deps.breaker.isOpen()) {
    await record("breaker_open");
    return degradedTo("breaker_open", input);
  }

  const result = await askModel(input.text, deps.llm, async (attempt) => {
    if (attempt.ok) {
      deps.breaker.recordSuccess();
      await record("ok", {
        inputTokens: attempt.usage.inputTokens,
        outputTokens: attempt.usage.outputTokens,
        costMicroUsd: costMicroUsd(attempt.model, attempt.usage),
        model: attempt.model,
        latencyMs: attempt.latencyMs,
      });
      return;
    }
    // Only an unhealthy provider trips the breaker. Bad output is the model
    // misbehaving on one input, not the service being down.
    if (attempt.reason === "timeout" || attempt.reason === "provider_error") {
      deps.breaker.recordFailure();
    }
    if (attempt.reason !== "disabled") {
      await record(attempt.reason, { latencyMs: attempt.latencyMs });
    }
  });

  if (!result.ok) {
    return degradedTo(result.reason, input);
  }

  const tidy = tidyPantryOutput(result.value);
  await deps.store.writeCache({ textHash, promptVersion: PANTRY_PROMPT_VERSION, ...tidy }, now);
  return { ...tidy, source: "llm", degraded: false, parser: PANTRY_PROMPT_VERSION };
}

/**
 * The synonym table's answer after the model was meant to run and did not.
 * Only the reason is logged — the pantry text never is; it is the user's words,
 * and nothing about why a parse fell back needs them.
 */
function degradedTo(reason: string, input: { text: string; requestId: string }): PantryParse {
  console.warn(
    JSON.stringify({
      level: "warn",
      event: "pantry_parse_degraded",
      reason,
      requestId: input.requestId,
    }),
  );
  return fromSynonyms(input.text, true);
}

const VOCABULARY: ReadonlySet<string> = new Set(ALL_INGREDIENTS);

function isIngredient(key: string): key is Ingredient {
  return VOCABULARY.has(key);
}

function fromSynonyms(text: string, degraded: boolean): PantryParse {
  const { recognised, unrecognised } = parseWithSynonyms(text);
  return { recognised, unrecognised, source: "synonyms", degraded, parser: SYNONYM_PARSER };
}
