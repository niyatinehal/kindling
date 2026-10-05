import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createGeminiLlmClient, toGeminiSchema } from "../../src/llm/geminiClient.js";
import { PANTRY_RESPONSE_SCHEMA } from "../../src/meals/pantryPrompt.js";

type Sent = { url: string; init: RequestInit };

/** A fetch that records the request and answers what the test says. */
function stubFetch(answer: (init: RequestInit) => Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    sent.push({ url, init });
    return answer(init);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

const reply = (text: string, extra: Record<string, unknown> = {}) =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "thinking…", thought: true }, { text }] },
          },
        ],
        usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 40, thoughtsTokenCount: 60 },
        modelVersion: "gemini-3.6-flash",
        ...extra,
      }),
      { status: 200 },
    ),
  );

const args = {
  system: "the system prompt",
  user: "<pantry>aloo</pantry>",
  schema: PANTRY_RESPONSE_SCHEMA,
  validate: (raw: unknown) => {
    if (typeof raw !== "object" || raw === null || !("recognised" in raw)) throw new Error("bad");
    return raw as { recognised: string[] };
  },
  timeoutMs: 200,
};

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("toGeminiSchema", () => {
  it("translates the pantry schema into Gemini's dialect, keeping the enum", () => {
    const schema = toGeminiSchema(PANTRY_RESPONSE_SCHEMA);

    expect(schema).toMatchObject({
      type: "OBJECT",
      required: ["recognised", "unrecognised"],
      propertyOrdering: ["recognised", "unrecognised"],
      properties: {
        recognised: { type: "ARRAY", items: { type: "STRING", enum: expect.any(Array) } },
        unrecognised: { type: "ARRAY", items: { type: "STRING" } },
      },
    });
    // No equivalent in Gemini, and sent anyway it is a 400.
    expect(JSON.stringify(schema)).not.toContain("additionalProperties");
  });
});

describe("createGeminiLlmClient", () => {
  it("asks for JSON against the schema and returns the validated answer with usage", async () => {
    const { fetch, sent } = stubFetch(() => reply('{"recognised":["potato"],"unrecognised":[]}'));

    const result = await createGeminiLlmClient({ apiKey: "g-key", fetch }).extract(args);

    expect(result).toMatchObject({
      ok: true,
      value: { recognised: ["potato"] },
      // Thinking tokens are billed as output.
      usage: { inputTokens: 700, outputTokens: 100 },
      model: "gemini-3.6-flash",
    });
    expect(sent[0]?.url).toMatch(/models\/gemini-3\.6-flash:generateContent$/);
    expect(new Headers(sent[0]?.init.headers).get("x-goog-api-key")).toBe("g-key");
    const body = JSON.parse(sent[0]?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: "the system prompt" }] },
      contents: [{ role: "user", parts: [{ text: "<pantry>aloo</pantry>" }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
  });

  it("sends an image as inline data before the text", async () => {
    const { fetch, sent } = stubFetch(() => reply('{"recognised":[],"unrecognised":[]}'));

    await createGeminiLlmClient({ apiKey: "g", fetch }).extract({
      ...args,
      image: { mediaType: "image/jpeg", base64: "/9j/AAAA" },
    });

    const body = JSON.parse(sent[0]?.init.body as string) as {
      contents: { parts: unknown[] }[];
    };
    expect(body.contents[0]?.parts).toEqual([
      { inlineData: { mimeType: "image/jpeg", data: "/9j/AAAA" } },
      { text: "<pantry>aloo</pantry>" },
    ]);
  });

  it("reports invalid output for a reply that fails validation, is not JSON, or was cut off", async () => {
    for (const answer of [
      () => reply('{"something":"else"}'),
      () => reply("not json at all"),
      () => reply('{"recognised":["pot', { candidates: [{ finishReason: "MAX_TOKENS" }] }),
    ]) {
      const { fetch } = stubFetch(answer);
      expect(await createGeminiLlmClient({ apiKey: "g", fetch }).extract(args)).toMatchObject({
        ok: false,
        reason: "invalid_output",
      });
    }
  });

  // Out of quota is "not now": answered at once, so the synonym table can step in.
  it("does not retry a 429, but marks a 5xx as retryable", async () => {
    const status = (code: number) =>
      createGeminiLlmClient({
        apiKey: "g",
        fetch: stubFetch(() => Promise.resolve(new Response("quota", { status: code }))).fetch,
      }).extract(args);

    expect(await status(429)).toMatchObject({ reason: "provider_error", retryable: false });
    expect(await status(503)).toMatchObject({ reason: "provider_error", retryable: true });
    expect(await status(400)).toMatchObject({ reason: "provider_error", retryable: false });
  });

  it("times out at the deadline", async () => {
    const { fetch } = stubFetch(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );

    const result = await createGeminiLlmClient({ apiKey: "g", fetch }).extract({
      ...args,
      timeoutMs: 30,
    });

    expect(result).toMatchObject({ ok: false, reason: "timeout", retryable: false });
  });

  it("treats a dropped connection as retryable, and logs it through redact", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { fetch } = stubFetch(() =>
      Promise.reject(new TypeError("fetch failed for owner@example.com")),
    );

    const result = await createGeminiLlmClient({ apiKey: "g", fetch }).extract(args);

    expect(result).toMatchObject({ reason: "provider_error", retryable: true });
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("owner@example.com");
  });
});
