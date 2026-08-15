import { webEnv } from "../env";

/**
 * The single place this app talks to Express.
 *
 * Two properties are load-bearing and both are asserted in tests: the request
 * carries the access token as a Bearer header, and it carries NO cookie. The
 * session cookie is this app's private business — forwarding it upstream would
 * hand the API a credential it has no use for and must never log.
 */
export async function callApi(
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const env = webEnv();
  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  });

  return fetch(`${env.API_BASE_URL.replace(/\/+$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    // Explicit: never attach ambient credentials to an upstream call.
    credentials: "omit",
    cache: "no-store",
  });
}
