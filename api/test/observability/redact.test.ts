import { describe, expect, it } from "@jest/globals";

import { redact } from "../../src/observability/redact.js";

/**
 * These error records are kept forever and are not covered by the account
 * deletion flow, so anything personal that reaches them outlives the person's
 * decision to leave. That makes redaction the load-bearing part of this
 * feature rather than a nicety: it is what lets the privacy page go on saying
 * these rows hold nothing about anybody.
 */
describe("redact", () => {
  it("removes email addresses", () => {
    expect(redact("no user for meera@example.com in family")).toBe(
      "no user for [redacted:email] in family",
    );
  });

  it("removes phone numbers", () => {
    expect(redact("verifyOtp failed for +919876543210")).toBe(
      "verifyOtp failed for [redacted:phone]",
    );
  });

  // The one that would be worst to leak: a token in a message is a live
  // credential sitting in a table somebody can read.
  it("removes anything shaped like a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

    expect(redact(`token rejected: ${jwt}`)).toBe("token rejected: [redacted:token]");
  });

  // Prisma puts the whole connection string in some driver errors, password
  // included. The readiness endpoint already refuses to return it; this stops
  // it being written down instead.
  it("removes postgres connection strings", () => {
    expect(redact("connect failed postgresql://postgres:hunter2@db.host:5432/postgres")).toBe(
      "connect failed [redacted:connection-string]",
    );
  });

  it("leaves an ordinary message alone", () => {
    expect(redact("plan generation failed: no exercises matched")).toBe(
      "plan generation failed: no exercises matched",
    );
  });

  // Unbounded text in a database column that nothing prunes is a slow leak of
  // a different kind.
  it("caps how much of any one message is kept", () => {
    expect(redact("x".repeat(5000)).length).toBeLessThanOrEqual(2048);
  });

  it("handles a message that is not a string at all", () => {
    expect(redact(undefined)).toBe("");
    expect(redact({ toString: () => "weird" })).toContain("weird");
  });
});
