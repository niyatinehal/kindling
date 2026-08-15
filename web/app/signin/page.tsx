"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import { nextStep } from "../../src/onboarding/nextStep";

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

  return (
    <main>
      <h1>{t("title")}</h1>
      {error !== undefined && (
        <p role="alert">{tError.has(error) ? tError(error) : tError("UNKNOWN")}</p>
      )}

      <label>
        {t("contactLabel")}
        <input value={contact} onChange={(event) => setContact(event.target.value)} />
      </label>

      {!sent ? (
        <button
          type="button"
          onClick={() => {
            void requestCode();
          }}
        >
          {t("sendCode")}
        </button>
      ) : (
        <>
          <label>
            {t("codeLabel")}
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => {
              void verifyCode();
            }}
          >
            {t("verify")}
          </button>
        </>
      )}

      {/*
        Points at the route that STARTS the OAuth flow, not at /auth/callback,
        which is where Google comes back to. Linking to the callback directly
        arrives with no `code` and is bounced straight to /?error=oauth.
      */}
      <a href="/api/auth/google">{t("google")}</a>
    </main>
  );
}
