/**
 * Pulls the code out of the `{ error: { code } }` envelope every route handler
 * and the API itself answer failures with.
 *
 * Returns `undefined` for anything that is not that shape — including the `{}`
 * `readJsonBody` produces for a bodiless response. Callers decide what to do
 * with the absence; nothing here guesses.
 */
export function errorCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
