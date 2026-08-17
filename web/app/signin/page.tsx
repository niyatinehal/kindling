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
import { LinkButton } from "../../src/ui/LinkButton";
import { Screen } from "../../src/ui/Screen";

export default function SignInPage() {
  const t = useTranslations("signin");
  const tError = useTranslations("errors");
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function requestCode() {
    const response = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    if (response.ok) {
      setSent(true);
      setError(undefined);
      return;
    }
    setError("OTP_REQUEST_FAILED");
  }

  async function verifyCode() {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact, code }),
    });

    if (!response.ok) {
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
    const response = await fetch("/api/auth/guest", { method: "POST" });

    if (!response.ok) {
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
      {error !== undefined && <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>}

      <Card>
        <div className="flex flex-col gap-4">
          <Field label={t("contactLabel")} value={contact} onChange={setContact} inputMode="tel" />

          {!sent ? (
            <Button
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
        {/*
            Points at the route that STARTS the OAuth flow, not at /auth/callback,
            which is where Google comes back to. Linking to the callback directly
            arrives with no `code` and is bounced straight to /?error=oauth.
          */}
        <LinkButton href="/api/auth/google" variant="secondary">
          {t("google")}
        </LinkButton>

        <Button
          variant="ghost"
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
