"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorCode } from "../../src/api/errorCode";
import { readJsonBody } from "../../src/api/readJsonBody";
import { ConsentForm, type ConsentSubmission } from "./ConsentForm";

/**
 * Bumped whenever the consent copy in `messages.consent` changes. It is stored
 * with the consent record so an audit can reproduce exactly what was agreed to,
 * which is why the version submitted must be the one whose copy is rendered.
 */
const POLICY_VERSION = "2026-08-15";

export function ConsentClient({ isGuest = false }: { isGuest?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function submit(submission: ConsentSubmission) {
    // Set before the first await, so the button is disabled by the time the
    // user could physically click it again.
    setSubmitting(true);

    let response: Response;
    try {
      response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: submission.displayName,
          locale: "en",
          consents: submission.consents,
        }),
      });
    } catch {
      // `fetch` itself rejecting — offline, connection dropped — is the one
      // path that reaches neither branch below. Left unhandled it would strand
      // the user behind a button that never re-enables.
      setSubmitting(false);
      setError("UPSTREAM_UNAVAILABLE");
      return;
    }

    if (response.ok) {
      // Deliberately still `submitting`: the route change is in flight, and
      // re-enabling the button now would allow a second registration during it.
      router.push("/home");
      return;
    }

    setSubmitting(false);
    // Read the body defensively: the proxy is allowed to answer with a legal
    // bodiless status, and a rejected `.json()` here would leave the user on a
    // screen that never changes.
    setError(errorCode(await readJsonBody(response)) ?? "UNKNOWN");
  }

  return (
    <ConsentForm
      onSubmit={(submission) => {
        void submit(submission);
      }}
      policyVersion={POLICY_VERSION}
      submitting={submitting}
      isGuest={isGuest}
      {...(error !== undefined && { error })}
    />
  );
}
