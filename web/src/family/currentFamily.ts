import { proxyUpstream } from "../api/proxy";
import { readJsonBody } from "../api/readJsonBody";
import { callApi } from "../api/upstream";
import { createSupabaseServerClient } from "../supabase/server";

export type FamilyMember = {
  user_id: string;
  display_name: string;
  role: string;
  status: string;
};

export type FamilySummary = {
  id: string;
  role: string;
  members: FamilyMember[];
};

/**
 * The caller's family and its members, or `null` when they are in none.
 *
 * Two hops, because the API is deliberately shaped that way: `/auth/me` is what
 * knows which family you belong to, and the members route is keyed by that id.
 * The web layer holds the id rather than the browser, so a client can never ask
 * for a family it does not belong to — the request simply cannot be formed.
 *
 * Never throws. Being in no family is the common case for every new user, and it
 * answers `null` exactly like a failure does, because both render the same
 * screen: the one that offers to create or join.
 */
export async function currentFamily(): Promise<FamilySummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken === undefined) {
      return null;
    }

    const meResponse = await proxyUpstream(() => callApi("/api/v1/auth/me", accessToken));
    if (!meResponse.ok) {
      return null;
    }

    const me = await readJsonBody(meResponse);
    const family =
      typeof me === "object" && me !== null && "family" in me
        ? (me as { family: { id?: string; role?: string } | null }).family
        : null;

    if (family === null || family.id === undefined || family.role === undefined) {
      return null;
    }

    const membersResponse = await proxyUpstream(() =>
      callApi(`/api/v1/families/${family.id}/members`, accessToken),
    );
    const body = membersResponse.ok ? await readJsonBody(membersResponse) : null;
    const members =
      typeof body === "object" && body !== null && "members" in body
        ? (body as { members: FamilyMember[] }).members
        : [];

    return { id: family.id, role: family.role, members };
  } catch (reason) {
    console.error("family could not be resolved", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    return null;
  }
}
