"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * The API caps `display_name` at 120 characters (`api/src/routes/auth.ts`).
 * Enforcing the same limit here keeps a preventable rejection out of the
 * journey — the field simply stops accepting more.
 */
export const DISPLAY_NAME_MAX_LENGTH = 120;

export type ConsentSubmission = {
  displayName: string;
  consents: { consent_type: "health_data"; policy_version: string }[];
};

export function ConsentForm({
  onSubmit,
  policyVersion,
  error,
}: {
  onSubmit: (submission: ConsentSubmission) => void;
  policyVersion: string;
  error?: string;
}) {
  const t = useTranslations("consent");
  const tError = useTranslations("errors");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const displayName = name.trim();
  const complete = displayName !== "" && agreed;

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>

      {error !== undefined && (
        <p role="alert">{tError.has(error) ? tError(error) : tError("UNKNOWN")}</p>
      )}

      <label>
        {t("nameLabel")}
        <input
          type="text"
          value={name}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          aria-label={t("healthDataLabel")}
        />
        {t("healthDataLabel")}
      </label>

      <button
        type="button"
        disabled={!complete}
        onClick={() => {
          onSubmit({
            displayName,
            consents: [{ consent_type: "health_data", policy_version: policyVersion }],
          });
        }}
      >
        {t("submit")}
      </button>
    </main>
  );
}
