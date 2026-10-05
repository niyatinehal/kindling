import { createHash } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client.js";
import type { LlmCallOutcome } from "../../generated/prisma/enums.js";
import { normalisePantryText } from "./normalise.js";

/** How long a cached answer is trusted. Pantries repeat; vocabularies change slowly. */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CachedParse = { recognised: string[]; unrecognised: string[] };

/** Each model feature has its own daily limit, so one cannot starve another. */
export type LlmFeature = "pantry_parse" | "pantry_photo" | "dish_explain";

export type LlmCallRecord = {
  userId: string;
  feature: LlmFeature;
  model: string;
  promptVersion: string;
  outcome: LlmCallOutcome;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  costMicroUsd: number | null;
  requestId: string;
};

/**
 * Everything the pantry parser keeps, behind one seam so the unit tests can run
 * it in memory. Production uses `createPrismaPantryStore`.
 */
export type PantryStore = {
  readCache(textHash: string, now: Date): Promise<CachedParse | null>;
  writeCache(
    entry: CachedParse & { textHash: string; promptVersion: string },
    now: Date,
  ): Promise<void>;
  /** Calls of one feature that reached the model for this user since `since`. */
  modelCallsSince(userId: string, feature: LlmFeature, since: Date): Promise<number>;
  recordCall(call: LlmCallRecord): Promise<void>;
  /** Cached dish sentences for the given keys; unexpired entries only. */
  readDishCache(cacheKeys: readonly string[], now: Date): Promise<Map<string, string>>;
  writeDishCache(
    entries: readonly { cacheKey: string; recipeKey: string; generator: string; text: string }[],
    now: Date,
  ): Promise<void>;
};

/**
 * The outcomes the daily limit counts: the model answered, or spent the time
 * budget trying. A parse produces at most one of these, because a retry only
 * ever follows a `provider_error`, which is not counted — so counting rows
 * counts parses, without trusting the request id. That id can be supplied by
 * the caller (see observability/requestId.ts), and a limit keyed on it could be
 * walked around by sending the same one every time.
 */
export const COUNTED_OUTCOMES: readonly LlmCallOutcome[] = ["ok", "timeout", "invalid_output"];

/**
 * The cache key: SHA-256 of the prompt version and the normalised text. The
 * version is in the key so a prompt change never serves answers from the old
 * prompt, and the text is normalised so "Aloo, Atta" and "atta,aloo" share one
 * entry. Only this hash is stored — never the text.
 */
export function pantryCacheKey(text: string, promptVersion: string): string {
  return createHash("sha256")
    .update(`${promptVersion}\n${normalisePantryText(text)}`)
    .digest("hex");
}

/** Daily limits reset at midnight UTC, the same day boundary tracking uses. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function createPrismaPantryStore(prisma: PrismaClient): PantryStore {
  return {
    async readCache(textHash, now) {
      const row = await prisma.pantryParseCache.findUnique({ where: { textHash } });
      if (row === null || row.expiresAt <= now) {
        return null;
      }
      return { recognised: row.recognised, unrecognised: row.unrecognised };
    },

    async writeCache(entry, now) {
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
      await prisma.pantryParseCache.upsert({
        where: { textHash: entry.textHash },
        create: { ...entry, expiresAt },
        update: {
          recognised: entry.recognised,
          unrecognised: entry.unrecognised,
          promptVersion: entry.promptVersion,
          createdAt: now,
          expiresAt,
        },
      });
      // The sweep rides on the write. Reads already ignore expired rows, so
      // this only keeps the table from growing; the index makes it cheap.
      await prisma.pantryParseCache.deleteMany({ where: { expiresAt: { lte: now } } });
    },

    modelCallsSince(userId, feature, since) {
      return prisma.llmCall.count({
        where: {
          userId,
          feature,
          createdAt: { gte: since },
          outcome: { in: [...COUNTED_OUTCOMES] },
        },
      });
    },

    async recordCall(call) {
      await prisma.llmCall.create({ data: call });
    },

    async readDishCache(cacheKeys, now) {
      const rows = await prisma.dishExplanationCache.findMany({
        where: { cacheKey: { in: [...cacheKeys] }, expiresAt: { gt: now } },
      });
      return new Map(rows.map((row) => [row.cacheKey, row.text]));
    },

    async writeDishCache(entries, now) {
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
      for (const entry of entries) {
        await prisma.dishExplanationCache.upsert({
          where: { cacheKey: entry.cacheKey },
          create: { ...entry, expiresAt },
          update: { text: entry.text, generator: entry.generator, createdAt: now, expiresAt },
        });
      }
      await prisma.dishExplanationCache.deleteMany({ where: { expiresAt: { lte: now } } });
    },
  };
}
