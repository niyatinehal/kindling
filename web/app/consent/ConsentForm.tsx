"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Field } from "../../src/ui/Field";
import { Screen } from "../../src/ui/Screen";

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
  submitting = false,
  isGuest = false,
}: {
  onSubmit: (submission: ConsentSubmission) => void;
  policyVersion: string;
  error?: string;
  /** True while a registration this form started is still in flight. */
  submitting?: boolean;
  /** True when the session belongs to an anonymous user. */
  isGuest?: boolean;
}) {
  const t = useTranslations("consent");
  const tError = useTranslations("errors");
  // A guest asked for one tap, not a form. The name is seeded rather than
  // forced — it is an ordinary editable field, and the consent below it is
  // emphatically NOT pre-granted: a pre-ticked box is not consent.
  const [name, setName] = useState(isGuest ? t("guestName") : "");
  const [agreed, setAgreed] = useState(false);

  const displayName = name.trim();
  const complete = displayName !== "" && agreed;

  return (
    <Screen title={t("title")}>
      <p className="text-lg leading-relaxed text-muted">{t("body")}</p>

      {isGuest && <p className="rounded-card bg-surface p-4 text-muted">{t("guestBody")}</p>}

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      <Card>
        <div className="flex flex-col gap-5">
          <Field
            label={t("nameLabel")}
            value={name}
            onChange={setName}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
          />

          {/*
              A big, plainly-worded checkbox, not a styled toggle. This is the
              one consent decision in the product and it must read as exactly
              what it is.
            */}
          <label className="flex min-h-12 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="size-6 shrink-0 accent-accent"
            />
            <span className="text-ink">{t("healthDataLabel")}</span>
          </label>
        </div>
      </Card>

      {/*
        `submitting` is not a nicety: without it the button stays enabled for
        the whole POST, and a second click posts a second registration. That is
        survivable today only because the API's register is idempotent — this
        form must not be the thing relying on that.
      */}
      <Button
        disabled={!complete || submitting}
        onClick={() => {
          onSubmit({
            displayName,
            consents: [{ consent_type: "health_data", policy_version: policyVersion }],
          });
        }}
      >
        {t("submit")}
      </Button>
    </Screen>
  );
}
