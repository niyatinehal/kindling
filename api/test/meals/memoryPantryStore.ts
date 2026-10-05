import type { CachedParse, LlmCallRecord, PantryStore } from "../../src/meals/pantryStore.js";
import { COUNTED_OUTCOMES } from "../../src/meals/pantryStore.js";

/**
 * `PantryStore` in memory, for unit tests. Mirrors the Prisma store's rules:
 * expired entries are misses, and only counted outcomes count toward the limit.
 */
export function createMemoryPantryStore(clock: () => Date = () => new Date()) {
  const cache = new Map<string, CachedParse & { promptVersion: string; expiresAt: Date }>();
  const calls: (LlmCallRecord & { createdAt: Date })[] = [];
  const dishCache = new Map<string, { text: string; expiresAt: Date }>();

  const store: PantryStore = {
    readCache(textHash, now) {
      const entry = cache.get(textHash);
      return Promise.resolve(
        entry === undefined || entry.expiresAt <= now
          ? null
          : { recognised: entry.recognised, unrecognised: entry.unrecognised },
      );
    },
    writeCache(entry, now) {
      cache.set(entry.textHash, {
        recognised: entry.recognised,
        unrecognised: entry.unrecognised,
        promptVersion: entry.promptVersion,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
      return Promise.resolve();
    },
    modelCallsSince(userId, feature, since) {
      return Promise.resolve(
        calls.filter(
          (call) =>
            call.userId === userId &&
            call.feature === feature &&
            call.createdAt >= since &&
            COUNTED_OUTCOMES.includes(call.outcome),
        ).length,
      );
    },
    recordCall(call) {
      calls.push({ ...call, createdAt: clock() });
      return Promise.resolve();
    },
    readDishCache(cacheKeys, now) {
      const found = new Map<string, string>();
      for (const key of cacheKeys) {
        const entry = dishCache.get(key);
        if (entry !== undefined && entry.expiresAt > now) found.set(key, entry.text);
      }
      return Promise.resolve(found);
    },
    writeDishCache(entries, now) {
      for (const entry of entries) {
        dishCache.set(entry.cacheKey, {
          text: entry.text,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        });
      }
      return Promise.resolve();
    },
  };

  return { store, cache, calls, dishCache };
}
