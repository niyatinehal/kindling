"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "../../src/ui/Alert";
import { Button } from "../../src/ui/Button";

/**
 * A client island in an otherwise server-rendered screen, which is why it is
 * its own file: `HomeView` has no "use client", and adding one to put a single
 * onClick on the page would ship the whole screen to the browser.
 */
export function SignOutButton() {
  const t = useTranslations("home");
  const tError = useTranslations("errors");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  // Without this the button stayed live for the whole POST. The second press
  // lands after the first has already cleared the cookie, so it answers 401 and
  // raises "we could not sign you out" over a session that is, in fact, gone.
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const response = await fetch("/api/auth/logout", { method: "POST" });

    if (!response.ok) {
      setSigningOut(false);
      // Deliberately stays on this screen. The cookie is still valid, so
      // navigating away would show a signed-in app to someone who believes
      // they just left.
      setFailed(true);
      return;
    }

    router.push("/");
    // Not optional. Next keeps server-rendered payloads in a client-side Router
    // Cache that a push does not invalidate, so without this a return to any
    // visited route can re-render the signed-in screen it captured before the
    // cookie was cleared — the session is gone, but the page still shows.
    router.refresh();
  }

  return (
    <>
      {failed && <Alert>{tError("SIGN_OUT_FAILED")}</Alert>}
      <Button
        variant="ghost"
        loading={signingOut}
        onClick={() => {
          void signOut();
        }}
      >
        {t("signOut")}
      </Button>
    </>
  );
}
