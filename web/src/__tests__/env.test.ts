import { loadWebEnv } from "../env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  API_BASE_URL: "http://127.0.0.1:3000",
};

describe("loadWebEnv", () => {
  it("accepts a complete environment", () => {
    expect(loadWebEnv(valid).API_BASE_URL).toBe("http://127.0.0.1:3000");
  });

  it("names the missing variable", () => {
    const { API_BASE_URL: _omitted, ...rest } = valid;
    expect(() => loadWebEnv(rest)).toThrow(/API_BASE_URL/);
  });

  it("rejects a non-URL", () => {
    expect(() => loadWebEnv({ ...valid, API_BASE_URL: "nonsense" })).toThrow(/API_BASE_URL/);
  });

  it("never echoes a value into the error", () => {
    let message = "";
    try {
      loadWebEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "", API_BASE_URL: "SECRETVALUE" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("SECRETVALUE");
  });
});
