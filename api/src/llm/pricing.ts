/**
 * What each model costs, in US dollars per million tokens.
 *
 * A constant to update by hand, not something fetched: the numbers are what
 * the cost column is computed from, so a change to them should be a reviewed
 * commit. Checked against Anthropic's pricing page on 2026-10-05.
 */
export const PRICES_PER_MTOK_USD: Readonly<Record<string, { input: number; output: number }>> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * The cost of one call in millionths of a dollar, or null for a model with no
 * price on file. Conveniently, $1 per million tokens is exactly one micro-dollar
 * per token, so the arithmetic stays in integers.
 *
 * The API reports a dated model id ("claude-haiku-4-5-20251001"), so a model
 * matches its undated price entry by prefix.
 */
export function costMicroUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number | null {
  const entry = Object.entries(PRICES_PER_MTOK_USD).find(
    ([name]) => model === name || model.startsWith(`${name}-`),
  );
  if (entry === undefined) {
    return null;
  }
  const [, price] = entry;
  return Math.round(usage.inputTokens * price.input + usage.outputTokens * price.output);
}
