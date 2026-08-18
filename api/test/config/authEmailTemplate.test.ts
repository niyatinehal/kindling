import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Guards a contract between two artifacts that are edited independently and
 * have no compile-time link: the sign-in screen (`web/app/signin/page.tsx`)
 * asks the user to type a numeric code, and the only thing that can put such a
 * code in front of them is the Supabase magic-link email template.
 *
 * GoTrue's built-in template renders `{{ .ConfirmationURL }}` and nothing else,
 * so an unconfigured stack emails a link with no code at all — leaving the code
 * field on the sign-in screen impossible to fill in, which is exactly the bug
 * this pins.
 *
 * What this does NOT prove: that a running stack picked the template up. The
 * CLI reads `config.toml` only when the stack starts, so proving delivery needs
 * a restart and a live request — see the auth section of the README.
 */
const repoFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");

describe("supabase magic-link email template", () => {
  it("renders the OTP code, not just the confirmation link", () => {
    expect(repoFile("supabase/templates/magic_link.html")).toContain("{{ .Token }}");
  });

  it("is wired up in config.toml so GoTrue uses it instead of its built-in default", () => {
    const config = repoFile("supabase/config.toml");

    expect(config).toContain("[auth.email.template.magic_link]");

    const block = config.slice(config.indexOf("[auth.email.template.magic_link]"));
    expect(block).toMatch(/content_path\s*=\s*"[^"]*templates\/magic_link\.html"/);
  });
});

/**
 * The SMTP block is the one place in this repo where a credential could plausibly
 * get committed: it is a config file, it lives in git, and the fastest way to make
 * mail work is to paste the key straight in. So the test does not check that SMTP
 * is on or off — a developer flips that locally, legitimately — it checks that
 * however it is set, the secrets still come from the environment.
 */
describe("supabase SMTP configuration", () => {
  const smtpBlock = (): string => {
    const config = repoFile("supabase/config.toml");
    const start = config.indexOf("[auth.email.smtp]");
    expect(start).toBeGreaterThan(-1);
    // To the next top-level table, so a later section's values cannot leak in.
    const rest = config.slice(start + 1);
    const end = rest.indexOf("\n[");
    return end === -1 ? rest : rest.slice(0, end);
  };

  it("takes every credential from the environment, never a literal", () => {
    const block = smtpBlock();

    for (const field of ["host", "user", "pass", "admin_email", "sender_name"]) {
      expect(block).toMatch(new RegExp(`^${field}\\s*=\\s*"env\\([A-Z_]+\\)"$`, "m"));
    }
  });

  it("keeps the port a literal, because the CLI rejects env() on an integer field", () => {
    expect(smtpBlock()).toMatch(/^port\s*=\s*\d+$/m);
  });

  // 2/hour is the CLI default and it only starts applying once real SMTP is on.
  // A household signing in over one breakfast is not abusive traffic, and the
  // symptom of hitting it is a sign-in that silently stops emailing anyone.
  it("allows a household's worth of sign-in emails per hour", () => {
    const config = repoFile("supabase/config.toml");
    const limit = /^email_sent\s*=\s*(\d+)$/m.exec(config);

    expect(limit).not.toBeNull();
    expect(Number(limit?.[1])).toBeGreaterThanOrEqual(10);
  });
});
