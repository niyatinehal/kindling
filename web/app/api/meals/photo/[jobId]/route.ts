import { NextResponse } from "next/server";

import { proxyUpstream } from "../../../../../src/api/proxy";
import { callApi } from "../../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../../src/supabase/server";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Where a photo job has got to. The id is checked against the UUID shape
 * before it goes anywhere near a URL: it comes from the browser, and it is
 * interpolated into the upstream path.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token === undefined) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const { jobId } = await params;
  if (!JOB_ID.test(jobId)) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return proxyUpstream(() => callApi(`/api/v1/meals/parse-photo/${jobId}`, token));
}
