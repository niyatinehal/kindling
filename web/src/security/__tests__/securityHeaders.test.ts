import { SECURITY_HEADERS } from "../securityHeaders.mjs";

function valueOf(key: string): string | undefined {
  return SECURITY_HEADERS.find((header) => header.key.toLowerCase() === key)?.value;
}

/**
 * These are asserted individually rather than as one snapshot of the array.
 * A snapshot fails loudly when a header is added, which trains people to
 * re-record it; each of these fails only when the guarantee it names is
 * actually gone.
 */
describe("security headers", () => {
  // Health data over a downgraded connection is the failure this prevents.
  // Two years, because a short max-age leaves a window on every first visit.
  it("pins HTTPS for long enough to matter", () => {
    expect(valueOf("strict-transport-security")).toContain("max-age=63072000");
    expect(valueOf("strict-transport-security")).toContain("includeSubDomains");
  });

  // Without it a response the app intends as data can be sniffed into script.
  it("refuses content-type sniffing", () => {
    expect(valueOf("x-content-type-options")).toBe("nosniff");
  });

  /*
    Clickjacking on this app is not a hypothetical nuisance: the screens carry
    single-tap controls that write health entries, and one framed over a
    decoy page logs data on someone's behalf. Both headers, because
    X-Frame-Options is what older browsers honour and frame-ancestors is what
    the modern ones do.
  */
  it("cannot be framed", () => {
    expect(valueOf("x-frame-options")).toBe("DENY");
    expect(valueOf("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("does not leak the path to other origins", () => {
    expect(valueOf("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  // Nothing here uses a camera, a microphone or location. Saying so denies
  // them to anything that ever gets injected into a page.
  it("gives away no device permissions", () => {
    const policy = valueOf("permissions-policy") ?? "";
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
      expect(policy).toContain(feature);
    }
  });
});
