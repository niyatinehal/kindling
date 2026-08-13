import { describe, expect, it } from "@jest/globals";

import { loadEnv } from "../../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
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
});
