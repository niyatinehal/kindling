import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../src/api/proxy";
import { callApi } from "../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Under the 4.5 MB a hosted function accepts; the screen shrinks photos well below this. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Hands a pantry photo to the API's job queue, as the raw bytes it arrived
 * as. Nothing here keeps it: it is read into memory, forwarded, and dropped.
 * The size and type are checked here only to fail fast and cheaply; the API
 * checks both again, and sniffs the bytes.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!IMAGE_TYPES.has(contentType)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 413 });
  }

  return proxyUpstream(() =>
    callApi("/api/v1/meals/parse-photo", token, {
      method: "POST",
      raw: { bytes, contentType },
    }),
  );
}
