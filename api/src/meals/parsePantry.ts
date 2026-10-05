import type { FamilyRole } from "../../generated/prisma/enums.js";
import type { LlmClient, LlmResult } from "../llm/client.js";
import { ageFromBirthYear } from "../profile/toProfileView.js";
import {
  PANTRY_PROMPT_V1,
  PANTRY_PROMPT_VERSION,
  PANTRY_TOOL_SCHEMA,
  pantryOutput,
  pantryUserMessage,
  tidyPantryOutput,
} from "./pantryPrompt.js";
import type { PantryOutput } from "./pantryPrompt.js";
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

/**
 * Turns free-text pantry input into ingredient keys for the confirm step.
 *
 * The model is the first choice when the caller may use it, and the synonym
 * table answers in every other case — not consented, a child or minor, the kill
 * switch off, a timeout, a provider error, or output that fails validation. So
 * this never throws because of a model: the worst case is the table's answer
 * with `degraded: true`. Either way the result is only a list the user confirms
 * as chips, so a wrong parse costs one tap rather than a wrong meal.
 */
export async function parsePantry(
  input: {
    text: string;
    consented: boolean;
    role: FamilyRole | undefined;
    /** From the stored profile; null when there is none. */
    birthYear: number | null;
    requestId?: string | undefined;
  },
  deps: { llm: LlmClient },
): Promise<PantryParse> {
  if (!deps.llm.enabled || !mayUseModel(input)) {
    return fromSynonyms(input.text, false);
  }

  const attempt = (timeoutMs: number): Promise<LlmResult<PantryOutput>> =>
    deps.llm.extract({
      system: PANTRY_PROMPT_V1,
      user: pantryUserMessage(input.text),
      schema: PANTRY_TOOL_SCHEMA,
      validate: (raw) => pantryOutput.parse(raw),
      timeoutMs,
    });

  let result = await attempt(LLM_TIMEOUT_MS);
  let attempts = 1;

  if (!result.ok && result.retryable) {
    const remaining = PARSE_BUDGET_MS - result.latencyMs;
    if (remaining >= MIN_RETRY_MS) {
      result = await attempt(Math.min(LLM_TIMEOUT_MS, remaining));
      attempts++;
    }
  }

  if (!result.ok) {
    // Only the outcome is logged. The pantry text never is — it is the user's
    // words, and nothing about why a parse fell back needs them.
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "pantry_parse_degraded",
        reason: result.reason,
        attempts,
        requestId: input.requestId ?? null,
      }),
    );
    return fromSynonyms(input.text, result.reason !== "disabled");
  }

  return {
    ...tidyPantryOutput(result.value),
    source: "llm",
    degraded: false,
    parser: PANTRY_PROMPT_VERSION,
  };
}

function fromSynonyms(text: string, degraded: boolean): PantryParse {
  const { recognised, unrecognised } = parseWithSynonyms(text);
  return { recognised, unrecognised, source: "synonyms", degraded, parser: SYNONYM_PARSER };
}
