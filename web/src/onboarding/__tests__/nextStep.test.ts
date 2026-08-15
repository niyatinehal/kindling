import { nextStep } from "../nextStep";

describe("nextStep", () => {
  it("sends an unregistered user to consent", () => {
    expect(nextStep(403, { error: { code: "REGISTRATION_REQUIRED" } })).toBe("/consent");
  });

  it("sends a registered user home", () => {
    expect(nextStep(200, { id: "u1", display_name: "Meera", family: null })).toBe("/home");
  });

  it("sends an unauthenticated user back to sign in", () => {
    expect(nextStep(401, { error: { code: "UNAUTHENTICATED" } })).toBe("/signin");
  });

  it("does NOT treat an unrelated 403 as the registration seam", () => {
    expect(nextStep(403, { error: { code: "FORBIDDEN_ROLE" } })).toBe("/error");
  });

  it("routes an unexpected status to the error page rather than guessing", () => {
    expect(nextStep(500, {})).toBe("/error");
  });

  // The proxy is allowed to answer with a legal bodiless status, and the client
  // turns an unparsable body into `{}`. A 403 that arrives with nothing in it
  // is not evidence of the registration seam, so it must not be treated as one.
  it("does not route a bodiless 403 to consent", () => {
    expect(nextStep(403, {})).toBe("/error");
  });
});
