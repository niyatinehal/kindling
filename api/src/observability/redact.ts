/** Long enough to debug from, short enough that a runaway message cannot fill a table. */
const MAX_LENGTH = 2048;

/**
 * Order matters. A Postgres connection string contains an `@` and a host that
 * satisfies the email pattern, so it has to be taken out first or it gets
 * half-redacted into something that still leaks the password.
 */
const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/postgres(?:ql)?:\/\/\S+/gi, "[redacted:connection-string]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted:token]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted:email]"],
  // Deliberately narrow: either an international number with its `+`, or ten
  // digits standing alone. A looser "long run of digits and hyphens" also
  // matches a UUID, and turning every record id in an error message into
  // "[redacted:phone]" would cost the debuggability this whole feature exists
  // for while protecting nothing.
  [/(?<![\w-])(?:\+\d[\d\s-]{7,}\d|\d{10})(?![\w-])/g, "[redacted:phone]"],
] as const;

/**
 * Turns whatever was thrown into text worth storing.
 *
 * `String(value)` would do it in one line and produce "[object Object]" for a
 * plain object — which is how a message that had something useful in it
 * becomes a row telling you nothing. A custom `toString` is honoured because
 * error-like objects usually define one; anything else is serialised.
 */
function stringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const own: unknown = (value as { toString?: unknown }).toString;
    if (typeof own === "function" && own !== Object.prototype.toString) {
      const described: unknown = own.call(value);
      if (typeof described === "string") {
        return described;
      }
    }

    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return "[unserialisable]";
    }
  }

  // Spelled out rather than a single String() with a cast. Only these types
  // can reach here, and naming them is what makes it provable that nothing
  // stringifies to "[object Object]".
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  // A function, or something exotic. There is nothing worth writing down.
  return "";
}

/**
 * Strips anything personal out of text on its way into the error table.
 *
 * These rows are kept indefinitely and are deliberately outside the account
 * deletion flow — they carry no user id, so there is nothing for a deletion to
 * find. That only holds while the free text is clean, which is what this does.
 * An error message is written by whoever threw it, and some of them interpolate
 * the value that caused the problem.
 *
 * Redaction is at the boundary rather than at each call site on purpose: there
 * are two dozen places that log, and a rule applied at twenty-four sites is a
 * rule with twenty-four chances to be forgotten.
 */
export function redact(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  let text = stringify(value);

  for (const [pattern, replacement] of PATTERNS) {
    text = text.replace(pattern, replacement);
  }

  return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) : text;
}
