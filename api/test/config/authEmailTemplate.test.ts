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
