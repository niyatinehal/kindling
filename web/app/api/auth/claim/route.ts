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

/**
 * Turns a guest into somebody who can come back.
 *
 * `updateUser` on the session that is already signed in, NOT a new sign-in.
 * That distinction is the entire feature: a guest is a real anonymous
 * `auth.users` row, `users.auth_user_id` points at it, and every profile,
 * plan and tracking log hangs off the domain row that references it. Creating
 * a second identity and moving the data would mean a migration nobody can
 * make atomic; attaching an address to the existing one means there is
 * nothing to move.
 *
 * Supabase sends a confirmation to the address and only promotes the account
 * when the link is followed, so nothing here is trusted on the strength of a
 * typed string. Until then the guest session keeps working exactly as it did.
 *
 * Rate limited on the same buckets as the OTP route because it is the same
 * cost: Supabase sends a message per attempt, from the same quota.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  const perContact = otpByContact(contactKey(parsed.data.contact));
  const perIp = otpByIp(callerIp(request));
  if (!perContact.allowed || !perIp.allowed) {
    return tooManyRequests(Math.max(perContact.retryAfterSeconds, perIp.retryAfterSeconds));
  }

  const supabase = await createSupabaseServerClient();
  const isEmail = parsed.data.contact.includes("@");
  const { error } = await supabase.auth.updateUser(
    isEmail ? { email: parsed.data.contact } : { phone: parsed.data.contact },
  );

  if (error) {
    console.error("claim failed", { reason: error.message });
    // Worth distinguishing: somebody typing an address they already have an
    // account for needs to sign in with it, not keep retrying here. Every
    // other reason stays generic — the upstream message is never returned.
    const taken = error.code === "email_exists" || error.code === "phone_exists";
    return NextResponse.json(
      { error: { code: taken ? "CLAIM_TAKEN" : "CLAIM_FAILED" } },
      { status: taken ? 409 : 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
