import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callerIp,
  contactKey,
  otpByContact,
  otpByIp,
  tooManyRequests,
} from "../../../../src/security/authLimits";
import { createSupabaseServerClient } from "../../../../src/supabase/server";

const body = z.object({ contact: z.string().min(3) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  // Before the client is built, and therefore before anything is spent. Both
  // keys are taken even when the first refuses: a caller working through a list
  // of addresses would otherwise never touch its own allowance.
  const perContact = otpByContact(contactKey(parsed.data.contact));
  const perIp = otpByIp(callerIp(request));
  if (!perContact.allowed || !perIp.allowed) {
    return tooManyRequests(Math.max(perContact.retryAfterSeconds, perIp.retryAfterSeconds));
  }

  const supabase = await createSupabaseServerClient();
  const isEmail = parsed.data.contact.includes("@");
  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp(
    isEmail
      ? {
          email: parsed.data.contact,
          // Where the link in the email comes back to. Left unset, Supabase
          // falls back to the project's Site URL — the site root, which has no
          // way to exchange the `code` the link carries. /auth/callback is the
          // only route that can. Naming it here also means the link stops
          // depending on a dashboard setting this repo cannot pin or test.
          options: { emailRedirectTo: new URL("/auth/callback", origin).toString() },
        }
      : { phone: parsed.data.contact },
  );

  if (error) {
    // Deliberately generic: whether an account exists is not the caller's business.
    console.error("otp request failed", { reason: error.message });
    return NextResponse.json({ error: { code: "OTP_REQUEST_FAILED" } }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
