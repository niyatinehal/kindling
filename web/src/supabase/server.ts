import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { webEnv } from "../env";

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
          cookieStore.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
        }
      },
    },
  });
}
