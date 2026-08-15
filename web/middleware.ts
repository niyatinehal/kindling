import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { secureCookieOptions } from "./src/supabase/server";

/**
 * Refreshes the session on every request. This must construct its own client
 * rather than reuse `createSupabaseServerClient`, because middleware writes
 * cookies onto a response object rather than through `next/headers`.
 *
 * Cookie flags still go through the shared `secureCookieOptions` so the
 * httpOnly guarantee is enforced at one site, not duplicated here.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, secureCookieOptions(options));
          }
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|serwist|manifest.webmanifest).*)"],
};
