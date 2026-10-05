/**
 * Text normalisation for free-text pantry input.
 *
 * Two jobs, kept in one file so they cannot disagree about what a "word" is:
 *
 *   - `normalisePantryText` produces one canonical string per pantry, so
 *     "Aloo, Atta" and "atta,aloo" are the same input. A later cache keys on a
 *     hash of this, so it has to be order- and punctuation-insensitive.
 *   - `splitPantrySegments` breaks text into the clauses the synonym parser
 *     reads one at a time, so "dahi hai aur paneer khatam" keeps its negation
 *     on paneer rather than leaking it onto dahi.
 *
 * Unicode-aware throughout. Hindi typed in Devanagari is real input, and its
 * vowel signs are combining marks (\p{M}): a letters-only filter would turn
 * "आलू" into "आल". NFC first, so a precomposed "ज़" and "ज" + nukta compare
 * equal.
 */

/** Anything that is not a letter, a combining mark, a digit or a space. */
const PUNCTUATION = /[^\p{L}\p{M}\p{N}\s]+/gu;

/** One normalised word run: lowercase, punctuation as space, single spaces. */
export function normalisePhrase(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}

/**
 * The canonical form of a whole pantry: comma-separated parts, each
 * normalised, empties dropped, sorted, joined. Sorting is what makes two
 * orderings of the same list one cache entry.
 */
export function normalisePantryText(text: string): string {
  return text
    .split(",")
    .map(normalisePhrase)
    .filter((part) => part !== "")
    .sort()
    .join(", ");
}

/**
 * Words and symbols that join two items rather than describe one. Splitting on
 * them scopes a negation to its own clause: "atta hai aur dahi khatam" is two
 * statements, one of them about something that is not there.
 */
const CONJUNCTIONS = /\s(?:and|aur|or|ya|plus|with|और|या)\s/gu;

/** Splits on list punctuation and conjunctions; each segment is normalised. */
export function splitPantrySegments(text: string): string[] {
  return text
    .normalize("NFC")
    .split(/[,;\n|।&+/]+/u)
    .flatMap((part) => ` ${part.toLowerCase()} `.split(CONJUNCTIONS))
    .map(normalisePhrase)
    .filter((segment) => segment !== "");
}
