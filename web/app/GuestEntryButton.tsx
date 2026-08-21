"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { enterAsGuest } from "../src/auth/enterAsGuest";
import { Alert } from "../src/ui/Alert";
import { Button } from "../src/ui/Button";

/**
 * The landing page's primary action.
 *
 * Guest mode already existed and was buried a screen deep, behind the sign-in
 * form it exists to let people avoid. Somebody arriving from a shared link has
 * not decided they want an account yet — asking them to make that decision
 * before seeing anything is the wrong order, and it is the reason a visitor
 * bounces.
 *
 * A client island rather than a client page: the landing screen is otherwise
 * static, and making the whole thing client-side to attach one onClick would
 * ship the copy, the preview and the layout to the browser for no reason.
 */
export function GuestEntryButton() {
  const t = useTranslations("landing");
  const tError = useTranslations("errors");
  const router = useRouter();

  const [entering, setEntering] = useState(false);
  const [failed, setFailed] = useState(false);

  async function enter(): Promise<void> {
    setEntering(true);
    setFailed(false);

    const entered = await enterAsGuest();

    if (entered === null) {
      setEntering(false);
      setFailed(true);
      return;
    }

    // Deliberately not cleared on success: this navigates, and flicking the
    // button back to its resting label mid-route-change reads as nothing
    // having happened.
    router.push(entered.destination);
  }

  return (
    <>
      {failed && <Alert>{tError("GUEST_SIGNIN_FAILED")}</Alert>}
      <Button
        loading={entering}
        onClick={() => {
          void enter();
        }}
      >
        {t("tryGuest")}
      </Button>
    </>
  );
}
