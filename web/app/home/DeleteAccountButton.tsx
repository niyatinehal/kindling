"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCode } from "../../src/api/errorCode";
import { readJsonBody } from "../../src/api/readJsonBody";
import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";

/**
 * The only irreversible control in this app.
 *
 * It asks first, and the confirmation is rendered in the page rather than
 * raised as a `confirm()` dialog: a browser dialog is dismissed by muscle
 * memory, cannot be styled to say what is about to happen, and on a phone
 * appears somewhere the person's thumb already is.
 *
 * `ghost`, the quietest variant, and last on the screen — beside Sign out,
 * which is the other thing people come to this corner for. The confirmation
 * step is what separates them, because on a phone the two are one mis-tap
 * apart.
 */
export function DeleteAccountButton() {
  const t = useTranslations("home");
  const tError = useTranslations("errors");
  const router = useRouter();

  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function remove(): Promise<void> {
    setDeleting(true);
    setError(undefined);

    const response = await fetch("/api/account", { method: "DELETE" });

    if (!response.ok) {
      setDeleting(false);
      const code = errorCode(await readJsonBody(response));
      // A refusal this specific has an action attached to it, so it is worth
      // naming. Anything else is a failure the person cannot act on.
      setError(code === "FAMILY_NEEDS_ADMIN" ? code : "ACCOUNT_DELETE_FAILED");
      return;
    }

    // The session was ended server-side by the route handler. `refresh` is
    // what clears Next's client-side Router Cache, which a push alone does
    // not — without it, going back would re-render a signed-in screen built
    // for an account that no longer exists.
    router.push("/");
    router.refresh();
  }

  if (!asking) {
    return (
      <>
        {error !== undefined && (
          <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setAsking(true);
          }}
        >
          {t("deleteAccount")}
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      <p className="text-muted">{t("deleteWarning")}</p>

      <Button
        variant="ghost"
        loading={deleting}
        onClick={() => {
          void remove();
        }}
      >
        {t("deleteConfirm")}
      </Button>

      {/*
        Keeping the account is the safe outcome, so it gets the ordinary
        button and the deletion gets the quiet one — the reverse of the usual
        dialog, deliberately.
      */}
      <Button
        variant="secondary"
        disabled={deleting}
        onClick={() => {
          setAsking(false);
          setError(undefined);
        }}
      >
        {t("deleteCancel")}
      </Button>
    </div>
  );
}
