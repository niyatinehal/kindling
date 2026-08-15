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

export default function ConsentPage() {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(submission: ConsentSubmission) {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        display_name: submission.displayName,
        locale: "en",
        consents: submission.consents,
      }),
    });

    if (response.ok) {
      router.push("/home");
      return;
    }

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
      {...(error !== undefined && { error })}
    />
  );
}
