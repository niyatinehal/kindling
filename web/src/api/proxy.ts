import { NextResponse } from "next/server";

/**
 * Statuses that may not carry a body. `NextResponse.json(x, { status: 204 })`
 * throws outright ("Invalid response status code"), so these have to be built
 * as a bodiless response or they cannot be proxied at all.
 */
const STATUSES_WITHOUT_BODY = new Set([204, 304]);

/**
 * One code for every way upstream can fail to produce a usable answer. The
 * client cannot act differently on "refused" versus "served HTML", and the
 * distinction that does matter to us is in the log line, not the body.
 */
function upstreamUnavailable(): NextResponse {
  return NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE" } }, { status: 502 });
}

/**
 * Turns one upstream call into a response this app can always return.
 *
 * The contract every route handler leans on: this never throws and never
 * returns a bodiless 500. Whatever happens — Express down, DNS failure, a
 * timeout, an ingress serving an HTML 502, a path miss serving `Cannot GET
 * /...`, an empty body — the caller gets either a faithful pass-through of the
 * upstream status and JSON, or a `{ error: { code } }` envelope. The client
 * calls `.json()` on the result unconditionally, so a response with no parsable
 * body strands it on a hung screen instead of letting it route to an error
 * page.
 *
 * Reasons are logged, never returned: the caller has no business knowing which
 * host refused a connection.
 */
export async function proxyUpstream(send: () => Promise<Response>): Promise<NextResponse> {
  let upstream: Response;

  try {
    upstream = await send();
  } catch (reason) {
    console.error("upstream call failed", { reason: describe(reason) });
    return upstreamUnavailable();
  }

  if (STATUSES_WITHOUT_BODY.has(upstream.status)) {
    return new NextResponse(null, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    console.error("upstream returned a non-JSON body", { status: upstream.status, contentType });
    return upstreamUnavailable();
  }

  let body: string;
  try {
    body = await upstream.text();
  } catch (reason) {
    console.error("upstream body could not be read", { reason: describe(reason) });
    return upstreamUnavailable();
  }

  // A legitimately empty body (a 200 with nothing in it) is passed through as
  // an empty body rather than invented into `null`.
  if (body.trim() === "") {
    return new NextResponse(null, { status: upstream.status });
  }

  try {
    // Status is passed through unchanged — a 403 REGISTRATION_REQUIRED is a
    // step in onboarding, not a failure, and flattening it would hide the seam.
    return NextResponse.json(JSON.parse(body), { status: upstream.status });
  } catch (reason) {
    console.error("upstream body was not valid JSON", {
      status: upstream.status,
      reason: describe(reason),
    });
    return upstreamUnavailable();
  }
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
