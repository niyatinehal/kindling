/**
 * Reads a response body the client is about to route on, without ever
 * rejecting.
 *
 * `proxyUpstream` guarantees a parsable body OR a legal bodiless status — it
 * emits one for an empty upstream body and for 204/304. A blind `.json()` on
 * those rejects, and a rejection inside a click handler is not an error page:
 * it is a screen that sits there forever. Returning `{}` instead lets the
 * caller carry on and route on the status, which for anything unexpected means
 * `/error`.
 *
 * `{}` is deliberately indistinguishable from "a body with nothing useful in
 * it", because no caller can act on the difference.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
