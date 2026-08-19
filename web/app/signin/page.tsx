"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { nextStep } from "../../src/onboarding/nextStep";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Field } from "../../src/ui/Field";
import { Screen } from "../../src/ui/Screen";

/**
 * The three ways off this screen, and therefore the three it can report on.
 *
 * `verify` and `guest` are never cleared on success on purpose: both navigate,
 * and flicking the button back to its resting label while the route change is
 * still in progress reads as "nothing happened".
 */
type SignInAction = "sendCode" | "verify" | "guest";

export default function SignInPage() {
  const t = useTranslations("signin");
  const tError = useTranslations("errors");
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Which sign-in action is in flight. Every button here posts, and none of
  // them used to stop a second press: two OTP requests meant two texts, and the
  // second code invalidated the one already on its way.
  const [pending, setPending] = useState<SignInAction | null>(null);

  async function requestCode() {
    setPending("sendCode");
    const response = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    setPending(null);

    if (response.ok) {
      setSent(true);
      setError(undefined);
      return;
    }
    setError("OTP_REQUEST_FAILED");
  }

  async function verifyCode() {
    setPending("verify");
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact, code }),
    });

    if (!response.ok) {
      setPending(null);
      setError("UNAUTHENTICATED");
      return;
    }

    // The session cookie is set. Ask the product whether it knows this user.
    // The body is read defensively: the proxy may legally answer with no body
    // at all, and a rejected `.json()` here would hang the screen instead of
    // routing to /error.
    const me = await fetch("/api/me");
    router.push(nextStep(me.status, await readJsonBody(me)));
  }

  async function continueAsGuest() {
    setPending("guest");
    const response = await fetch("/api/auth/guest", { method: "POST" });

    if (!response.ok) {
      setPending(null);
      setError("GUEST_SIGNIN_FAILED");
      return;
    }

    // Deliberately identical to what verifyCode does after a successful
    // verification. A guest is a user who signed in differently, so the
    // journey after sign-in is the same journey, resolved by the same call.
    const me = await fetch("/api/me");
    router.push(nextStep(me.status, await readJsonBody(me)));
  }

  return (
    <Screen title={t("title")}>
      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      <Card>
        <div className="flex flex-col gap-4">
          <Field label={t("contactLabel")} value={contact} onChange={setContact} />

          {!sent ? (
            <Button
              disabled={pending !== null}
              loading={pending === "sendCode"}
              onClick={() => {
                void requestCode();
              }}
            >
              {t("sendCode")}
            </Button>
          ) : (
            <>
              <Field label={t("codeLabel")} value={code} onChange={setCode} inputMode="numeric" />
              <Button
                disabled={pending !== null}
                loading={pending === "verify"}
                onClick={() => {
                  void verifyCode();
                }}
              >
                {t("verify")}
              </Button>
            </>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          disabled={pending !== null}
          loading={pending === "guest"}
          onClick={() => {
            void continueAsGuest();
          }}
        >
          {t("guest")}
        </Button>
      </div>
    </Screen>
  );
}
