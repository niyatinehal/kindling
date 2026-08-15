import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { webEnv } from "../env";

/**
 * Forces the security-critical cookie flags, regardless of what the caller
 * (or a future Supabase default) passes in. The literals are spread AFTER
 * `...options` so nothing can override them — that ordering is load-bearing.
 *
 * This is the one place both `createSupabaseServerClient` (below) and
 * `middleware.ts` funnel through, so the httpOnly guarantee is enforced at
 * a single site rather than duplicated and potentially drifting.
 */
export function secureCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * The ONLY Supabase client in this app, and deliberately the server one.
 *
 * `createBrowserClient` writes the session with `document.cookie`, and a cookie
 * set by JavaScript can never be httpOnly — so it would leave the session
 * readable by any injected script. That failure is silent: sign-in still works.
 * `eslint.config.mjs` bans the browser client outright so this cannot regress.
 */
export async function createSupabaseServerClient() {
  const env = webEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, secureCookieOptions(options));
        }
      },
    },
  });
}
