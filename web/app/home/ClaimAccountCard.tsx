"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { errorCode } from "../../src/api/errorCode";
import { readJsonBody } from "../../src/api/readJsonBody";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Field } from "../../src/ui/Field";

/**
 * The way out of guest mode, and the answer to the one thing guest mode was
 * always going to cost somebody: a week of logged meals living in a browser
 * they are one cleared cookie away from losing.
 *
 * It replaces the note that used to sit here. Telling a guest their data is
 * only in this browser, and offering nothing to do about it, is a warning
 * rather than a feature — the same sentence with a field under it is help.
 *
 * The account is not created here and nothing moves: the guest already IS a
 * real user, and this attaches an address to that same identity. Which is why
 * the reassurance in `claimSent` is true rather than kind — the data is not in
 * transit while somebody goes to find the email.
 */
export function ClaimAccountCard() {
  const t = useTranslations("home");
  const tError = useTranslations("errors");

  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function claim(): Promise<void> {
    setSending(true);
    setError(undefined);

    const response = await fetch("/api/auth/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact: contact.trim() }),
    });

    setSending(false);

    if (!response.ok) {
      const code = errorCode(await readJsonBody(response));
      setError(code !== undefined && tError.has(code) ? code : "CLAIM_FAILED");
      return;
    }

    setSent(true);
  }

  return (
    <Card tone="emphasis">
      <h2 className="text-sm font-semibold tracking-widest uppercase">{t("claimTitle")}</h2>

      {error !== undefined && (
        <div className="mt-3">
          <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
        </div>
      )}

      {sent ? (
        // The field goes away once it has been used. Leaving it there invites a
        // second attempt, which sends a second message and invalidates the
        // link in the first one.
        <p className="mt-2 text-lg leading-relaxed">{t("claimSent")}</p>
      ) : (
        <>
          <p className="mt-2 text-lg leading-relaxed">{t("claimBody")}</p>
          <div className="mt-4 flex flex-col gap-3">
            <Field label={t("claimLabel")} value={contact} onChange={setContact} />
            <Button
              disabled={contact.trim() === ""}
              loading={sending}
              onClick={() => {
                void claim();
              }}
            >
              {t("claimAction")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
