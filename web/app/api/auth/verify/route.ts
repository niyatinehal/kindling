import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

const body = z.object({ contact: z.string().min(3), code: z.string().min(4) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const isEmail = parsed.data.contact.includes("@");
  const { error } = await supabase.auth.verifyOtp(
    isEmail
      ? { email: parsed.data.contact, token: parsed.data.code, type: "email" }
      : { phone: parsed.data.contact, token: parsed.data.code, type: "sms" },
  );

  if (error) {
    console.error("otp verification failed", { reason: error.message });
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  // The session cookie was written by the client's cookie adapter, which forces
  // httpOnly. Nothing about the session is returned in the body.
  return NextResponse.json({ authenticated: true });
}
