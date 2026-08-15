/**
 * @jest-environment node
 */
import { secureCookieOptions } from "../server";

describe("secureCookieOptions", () => {
  it("forces httpOnly to true even when the caller explicitly passed httpOnly: false", () => {
    const result = secureCookieOptions({ httpOnly: false });

    expect(result.httpOnly).toBe(true);
  });

  it("forces sameSite to lax", () => {
    const result = secureCookieOptions({ sameSite: "strict" });

    expect(result.sameSite).toBe("lax");
  });

  it("sets secure to false when NODE_ENV is not production", () => {
    const nodeEnv = jest.replaceProperty(process.env, "NODE_ENV", "test");

    const result = secureCookieOptions({});

    expect(result.secure).toBe(false);
    nodeEnv.restore();
  });

  it("sets secure to true when NODE_ENV is production", () => {
    const nodeEnv = jest.replaceProperty(process.env, "NODE_ENV", "production");

    const result = secureCookieOptions({});

    expect(result.secure).toBe(true);
    nodeEnv.restore();
  });

  it("preserves unrelated incoming options", () => {
    const result = secureCookieOptions({ path: "/", maxAge: 3600 });

    expect(result.path).toBe("/");
    expect(result.maxAge).toBe(3600);
  });
});
