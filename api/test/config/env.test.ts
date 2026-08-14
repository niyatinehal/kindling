import { describe, expect, it } from "@jest/globals";

import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
};

describe("loadEnv", () => {
  it("defaults NODE_ENV to development and PORT to 3000", () => {
    const env = loadEnv(valid);

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });

  it("coerces PORT from a string", () => {
    expect(loadEnv({ ...valid, PORT: "4000" }).PORT).toBe(4000);
  });

  it("throws naming a missing variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL that is not a URL", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: "nonsense" })).toThrow(/DATABASE_URL/);
  });

  it("never puts a variable's value in the error message", () => {
    let message = "";
    try {
      loadEnv({ ...valid, DATABASE_URL: "postgresql://user:SUPERSECRET@host/db", PORT: "abc" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("PORT");
    expect(message).not.toContain("SUPERSECRET");
  });

  it("requires SUPABASE_URL", () => {
    const { SUPABASE_URL: _omitted, ...withoutUrl } = valid;
    expect(() => loadEnv(withoutUrl)).toThrow(/SUPABASE_URL/);
  });

  it("rejects a SUPABASE_URL that is not a URL", () => {
    expect(() => loadEnv({ ...valid, SUPABASE_URL: "nonsense" })).toThrow(/SUPABASE_URL/);
  });

  it("leaves SUPABASE_SERVICE_ROLE_KEY undefined when unset", () => {
    expect(loadEnv(valid).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("accepts SUPABASE_SERVICE_ROLE_KEY when provided", () => {
    expect(
      loadEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "svc-key" }).SUPABASE_SERVICE_ROLE_KEY,
    ).toBe("svc-key");
  });
});
