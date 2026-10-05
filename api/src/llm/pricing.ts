/** US dollars per million tokens, input and output. */
export type ModelPrice = { input: number; output: number };

/**
 * What each model costs, in US dollars per million tokens.
 *
 * A constant to update by hand, not something fetched: the numbers are what
 * the cost column is computed from, so a change to them should be a reviewed
 * commit. Empty until Gemini's prices are checked against Google's pricing
 * page and added here, as "gemini-3.6-flash": { input, output } — until then
 * `costMicroUsd` is recorded as null rather than guessed.
 */
export const PRICES_PER_MTOK_USD: Readonly<Record<string, ModelPrice>> = {};

/**
 * The cost of one call in millionths of a dollar, or null for a model with no
 * price on file. $1 per million tokens is exactly one micro-dollar per token,
 * so the arithmetic stays in whole numbers.
 *
 * The API may report a more specific version than the name asked for, so a
 * model matches its price entry by prefix.
 */
export function costMicroUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
  prices: Readonly<Record<string, ModelPrice>> = PRICES_PER_MTOK_USD,
): number | null {
  const entry = Object.entries(prices).find(
    ([name]) => model === name || model.startsWith(`${name}-`),
  );
  if (entry === undefined) {
    return null;
  }
  const [, price] = entry;
  return Math.round(usage.inputTokens * price.input + usage.outputTokens * price.output);
}
