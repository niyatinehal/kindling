/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const assetlinks: unknown = JSON.parse(
  readFileSync(join(process.cwd(), "public/.well-known/assetlinks.json"), "utf8"),
);

type Statement = {
  relation?: string[];
  target?: { namespace?: string; package_name?: string; sha256_cert_fingerprints?: string[] };
};

/**
 * Digital Asset Links is what makes the Android app an app rather than a
 * browser with the address bar showing.
 *
 * The APK declares this origin; Chrome fetches this file and checks that the
 * certificate the APK was signed with is listed here. If it is not — wrong
 * fingerprint, wrong package name, file not served — the app still opens, but
 * as a Custom Tab with a URL bar across the top. It fails soft and it fails
 * ugly, which is exactly the kind of thing nobody notices until somebody says
 * "why does your app look like Chrome".
 *
 * These assertions are about shape rather than the exact fingerprint, because
 * the fingerprint changes if the signing key is ever rotated. What must never
 * happen silently is the file becoming malformed, or the package name drifting
 * from what android/twa-manifest.json builds.
 */
describe("digital asset links", () => {
  const statements = assetlinks as Statement[];

  it("delegates URL handling to the Android app", () => {
    expect(statements[0]?.relation).toContain("delegate_permission/common.handle_all_urls");
    expect(statements[0]?.target?.namespace).toBe("android_app");
  });

  // Must match `packageId` in android/twa-manifest.json. A mismatch is the
  // most common reason verification fails, and it produces no error anywhere.
  it("names the package the APK is actually built as", () => {
    expect(statements[0]?.target?.package_name).toBe("family.kindling.twa");
  });

  it("carries a well-formed signing fingerprint", () => {
    const [fingerprint] = statements[0]?.target?.sha256_cert_fingerprints ?? [];

    expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});
