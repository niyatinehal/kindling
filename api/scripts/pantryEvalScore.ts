/**
 * Scoring for the pantry eval. Pure functions, kept apart from the script that
 * calls the model so the arithmetic can be unit-tested without spending money.
 */

export type ScoredCase = { expected: readonly string[]; predicted: readonly string[] };

export type Score = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Null when nothing was predicted at all, rather than a misleading 0 or 1. */
  precision: number | null;
  /** Null when nothing was expected at all. */
  recall: number | null;
};

/**
 * Micro-averaged precision and recall over ingredient keys: every key in every
 * case counts once, so a case with eight ingredients weighs more than a case
 * with one, which is what "how many of the items did it get right" means.
 */
export function microScore(cases: readonly ScoredCase[]): Score {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const { expected, predicted } of cases) {
    const want = new Set(expected);
    const got = new Set(predicted);
    for (const key of got) {
      if (want.has(key)) truePositives++;
      else falsePositives++;
    }
    for (const key of want) {
      if (!got.has(key)) falseNegatives++;
    }
  }

  const predictedTotal = truePositives + falsePositives;
  const expectedTotal = truePositives + falseNegatives;
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision: predictedTotal === 0 ? null : truePositives / predictedTotal,
    recall: expectedTotal === 0 ? null : truePositives / expectedTotal,
  };
}

/** Nearest-rank percentile: the smallest value at or above `p` percent of the sample. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

/** "93.3%" or "n/a", for a table. */
export function asPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}
