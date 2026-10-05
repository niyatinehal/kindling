import type { PrismaClient } from "../../generated/prisma/client.js";
import type { CircuitBreaker } from "../llm/breaker.js";
import type { ImageMediaType, LlmClient } from "../llm/client.js";
import { costMicroUsd } from "../llm/pricing.js";
import { withOneRetry } from "../llm/retry.js";
import { mayUseModel } from "./parsePantry.js";
import { PANTRY_TOOL_SCHEMA, pantryOutput, tidyPantryOutput } from "./pantryPrompt.js";
import { createPrismaPantryStore, startOfUtcDay } from "./pantryStore.js";
import type { LlmCallRecord, PantryStore } from "./pantryStore.js";
import { PHOTO_PROMPT_V1, PHOTO_PROMPT_VERSION, PHOTO_USER_TEXT } from "./photoPrompt.js";
import type { Ingredient } from "./recipeLibrary.js";

/** Photos cost several times what a sentence does, so the daily allowance is smaller. */
export const DAILY_PHOTO_PARSES = 10;
/**
 * Far longer than the text budget: this runs as a background job the client
 * polls, so no request is held open, and reading an image is slower.
 */
const PHOTO_TIMEOUT_MS = 20_000;
const PHOTO_BUDGET_MS = 40_000;
const MIN_RETRY_MS = 5_000;

export type PhotoInput = {
  userId: string;
  requestId: string;
  mediaType: ImageMediaType;
  imageBase64: string;
};

export type PhotoOutcome =
  | {
      status: "done";
      recognised: Ingredient[];
      unrecognised: string[];
      parser: string;
    }
  | {
      status: "failed";
      reason:
        | "not_allowed"
        | "rate_limited"
        | "breaker_open"
        | "timeout"
        | "provider_error"
        | "invalid_output";
    };

export type PhotoDeps = {
  llm: LlmClient;
  store: PantryStore;
  breaker: CircuitBreaker;
  /**
   * Checked again when the job runs, not only when it was queued: consent can
   * be withdrawn in between, and the photo must not be sent after that.
   */
  stillAllowed: (userId: string, now: Date) => Promise<boolean>;
  now?: () => Date;
};

/**
 * Reads a photo of a fridge, groceries or a receipt into ingredient keys.
 *
 * Runs inside the photo job, after the image has already been removed from the
 * job's stored data (see photoQueue.ts): from here on it exists only in this
 * function's memory and in the request to the provider. Never cached — a photo
 * has no text to normalise — and never logged.
 *
 * Like the text path, the answer is only a list the user confirms as chips.
 */
export async function processPhoto(input: PhotoInput, deps: PhotoDeps): Promise<PhotoOutcome> {
  const now = deps.now?.() ?? new Date();
  if (!deps.llm.enabled || !(await deps.stillAllowed(input.userId, now))) {
    return { status: "failed", reason: "not_allowed" };
  }

  const started = Date.now();
  const record = (
    outcome: LlmCallRecord["outcome"],
    details: Partial<Pick<LlmCallRecord, "inputTokens" | "outputTokens" | "costMicroUsd">> & {
      latencyMs?: number;
    } = {},
  ) =>
    deps.store.recordCall({
      userId: input.userId,
      feature: "pantry_photo",
      model: deps.llm.model,
      promptVersion: PHOTO_PROMPT_VERSION,
      outcome,
      inputTokens: details.inputTokens ?? null,
      outputTokens: details.outputTokens ?? null,
      costMicroUsd: details.costMicroUsd ?? null,
      latencyMs: details.latencyMs ?? Date.now() - started,
      requestId: input.requestId,
    });

  const usedToday = await deps.store.modelCallsSince(
    input.userId,
    "pantry_photo",
    startOfUtcDay(now),
  );
  if (usedToday >= DAILY_PHOTO_PARSES) {
    await record("rate_limited");
    return { status: "failed", reason: "rate_limited" };
  }
  if (deps.breaker.isOpen()) {
    await record("breaker_open");
    return { status: "failed", reason: "breaker_open" };
  }

  const result = await withOneRetry(
    async (timeoutMs) => {
      const attempt = await deps.llm.extract({
        system: PHOTO_PROMPT_V1,
        user: PHOTO_USER_TEXT,
        image: { mediaType: input.mediaType, base64: input.imageBase64 },
        schema: PANTRY_TOOL_SCHEMA,
        validate: (raw) => pantryOutput.parse(raw),
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
    { timeoutMs: PHOTO_TIMEOUT_MS, totalMs: PHOTO_BUDGET_MS, minRetryMs: MIN_RETRY_MS },
  );

  if (!result.ok) {
    return {
      status: "failed",
      reason: result.reason === "disabled" ? "not_allowed" : result.reason,
    };
  }
  return { status: "done", ...tidyPantryOutput(result.value), parser: PHOTO_PROMPT_VERSION };
}

/**
 * The processor the photo worker runs in production: the Postgres store, and
 * the consent and guard checks read fresh from the database.
 */
export function createPhotoProcessor(deps: {
  prisma: PrismaClient;
  llm: LlmClient;
  breaker: CircuitBreaker;
}): (input: PhotoInput) => Promise<PhotoOutcome> {
  const store = createPrismaPantryStore(deps.prisma);
  const stillAllowed = async (userId: string, now: Date): Promise<boolean> => {
    const [profile, membership] = await Promise.all([
      deps.prisma.profile.findUnique({
        where: { userId },
        select: { aiPantryConsent: true, birthYear: true },
      }),
      deps.prisma.familyMembership.findFirst({
        where: { userId, status: "active", deletedAt: null },
        select: { role: true },
      }),
    ]);
    return mayUseModel(
      {
        consented: profile?.aiPantryConsent ?? false,
        role: membership?.role,
        birthYear: profile?.birthYear ?? null,
      },
      now,
    );
  };
  return (input) =>
    processPhoto(input, { llm: deps.llm, store, breaker: deps.breaker, stillAllowed });
}
