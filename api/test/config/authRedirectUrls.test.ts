import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Guards the other half of the sign-in email: not what it says (that is
 * `authEmailTemplate.test.ts`) but where its link goes.
 *
 * `site_url` is what GoTrue falls back to when a caller names no destination,
 * and it is also the allow-list every `redirect_to` is checked against. It is
 * plain prose in a file nothing imports, sitting next to an API that listens on
 * a different port than the web app — so pointing it at the wrong one is a
 * one-character mistake that no build, type check or route test can catch. The
 * symptom is a sign-in link that resolves to a running server which has never
 * heard of the path, which reads as "the link is broken" rather than "the
 * config is wrong".
 *
 * What this does NOT prove: that a hosted project agrees. `config.toml` is read
 * by the CLI only — Supabase Cloud takes these from its dashboard, which is why
 * the README makes setting them a deploy step.
 */
const repoFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");

const siteUrl = (): string => {
  const found = /^site_url\s*=\s*"([^"]+)"$/m.exec(repoFile("supabase/config.toml"));
  expect(found).not.toBeNull();
  return found?.[1] ?? "";
};

/** The port `npm run dev` actually serves the web app on. */
const webDevOrigin = (): string => {
  const pkg = JSON.parse(repoFile("web/package.json")) as { scripts: { dev: string } };
  const port = /-p\s+(\d+)/.exec(pkg.scripts.dev);
  expect(port).not.toBeNull();
  return `http://127.0.0.1:${port?.[1]}`;
};

describe("supabase auth redirect configuration", () => {
  it("points site_url at the web app, not at the API on its neighbouring port", () => {
    expect(siteUrl()).toBe(webDevOrigin());
  });

  it("allow-lists redirect URLs on the same origin it just declared", () => {
    const config = repoFile("supabase/config.toml");
    const found = /^additional_redirect_urls\s*=\s*\[([^\]]*)\]$/m.exec(config);
    expect(found).not.toBeNull();

    // flatMap over `?? []` rather than `map`: a match always has group 1, but
    // `noUncheckedIndexedAccess` cannot know that, and dropping the impossible
    // case keeps the array `string[]` without asserting.
    const entries = [...(found?.[1] ?? "").matchAll(/"([^"]+)"/g)].flatMap((m) => m[1] ?? []);

    // A scheme or port that disagrees with site_url matches nothing, which is
    // indistinguishable from having no allow-list at all.
    for (const entry of entries) {
      expect(entry.startsWith(webDevOrigin())).toBe(true);
    }
  });
});
