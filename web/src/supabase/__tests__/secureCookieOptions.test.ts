/**
 * @jest-environment node
 */
import { secureCookieOptions } from "../server";

describe("secureCookieOptions", () => {
  // Restores every `jest.replaceProperty` below even when an expectation
  // throws. Restoring inline after the `expect` would be skipped on exactly
  // the failure this suite exists to catch, leaking a mutated NODE_ENV into
  // whatever the worker runs next.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forces httpOnly to true even when the caller explicitly passed httpOnly: false", () => {
    const result = secureCookieOptions({ httpOnly: false });

    expect(result.httpOnly).toBe(true);
  });

  it("forces sameSite to lax", () => {
    const result = secureCookieOptions({ sameSite: "strict" });

    expect(result.sameSite).toBe("lax");
  });

  it("sets secure to false when NODE_ENV is not production", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "test");

    const result = secureCookieOptions({});

    expect(result.secure).toBe(false);
  });

  it("sets secure to true when NODE_ENV is production", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production");

    const result = secureCookieOptions({});

    expect(result.secure).toBe(true);
  });

  it("preserves unrelated incoming options", () => {
    const result = secureCookieOptions({ path: "/", maxAge: 3600 });

    expect(result.path).toBe("/");
    expect(result.maxAge).toBe(3600);
  });
});
