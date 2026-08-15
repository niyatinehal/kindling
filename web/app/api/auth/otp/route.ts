import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "../../../../src/supabase/server";

const body = z.object({ contact: z.string().min(3) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const isEmail = parsed.data.contact.includes("@");
  const { error } = await supabase.auth.signInWithOtp(
    isEmail ? { email: parsed.data.contact } : { phone: parsed.data.contact },
  );

  if (error) {
    // Deliberately generic: whether an account exists is not the caller's business.
    console.error("otp request failed", { reason: error.message });
    return NextResponse.json({ error: { code: "OTP_REQUEST_FAILED" } }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
