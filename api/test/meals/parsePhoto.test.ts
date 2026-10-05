import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createCircuitBreaker } from "../../src/llm/breaker.js";
import type { LlmClient } from "../../src/llm/client.js";
import { FakeLlmClient } from "../../src/llm/fakeClient.js";
import { DAILY_PHOTO_PARSES, processPhoto } from "../../src/meals/parsePhoto.js";
import { PHOTO_PROMPT_VERSION } from "../../src/meals/photoPrompt.js";
import { createMemoryPantryStore } from "./memoryPantryStore.js";

const NOW = new Date("2026-10-05T10:00:00Z");
const PHOTO = {
  userId: "user-1",
  requestId: "req-1",
  mediaType: "image/jpeg" as const,
  imageBase64: "/9j/AAAA",
};

function setup(llm: LlmClient, allowed = true) {
  const memory = createMemoryPantryStore(() => NOW);
  return {
    ...memory,
    deps: {
      llm,
      store: memory.store,
      breaker: createCircuitBreaker(),
      stillAllowed: () => Promise.resolve(allowed),
      now: () => NOW,
    },
  };
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("processPhoto", () => {
  it("sends the image with the photo prompt and returns checked, deduplicated keys", async () => {
    const llm = new FakeLlmClient([
      { output: { recognised: ["tomato", "egg", "tomato"], unrecognised: ["ketchup"] } },
    ]);

    const result = await processPhoto(PHOTO, setup(llm).deps);

    expect(result).toEqual({
      status: "done",
      recognised: ["tomato", "egg"],
      unrecognised: ["ketchup"],
      parser: PHOTO_PROMPT_VERSION,
    });
    expect(llm.calls[0]?.image).toEqual({ mediaType: "image/jpeg", base64: "/9j/AAAA" });
  });

  // Consent can be withdrawn between upload and the job running.
  it("does not send the photo if the person may no longer use the model", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: [], unrecognised: [] } }]);

    expect(await processPhoto(PHOTO, setup(llm, false).deps)).toEqual({
      status: "failed",
      reason: "not_allowed",
    });
    expect(llm.calls).toHaveLength(0);
  });

  it("falls over cleanly when the output is outside the vocabulary", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["pizza"], unrecognised: [] } }]);

    expect(await processPhoto(PHOTO, setup(llm).deps)).toEqual({
      status: "failed",
      reason: "invalid_output",
    });
  });

  it(`stops after ${DAILY_PHOTO_PARSES} photos a day`, async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["egg"], unrecognised: [] } }]);
    const { deps, calls } = setup(llm);

    for (let i = 0; i < DAILY_PHOTO_PARSES; i++) {
      expect((await processPhoto(PHOTO, deps)).status).toBe("done");
    }

    expect(await processPhoto(PHOTO, deps)).toEqual({ status: "failed", reason: "rate_limited" });
    expect(calls.every((call) => call.feature === "pantry_photo")).toBe(true);
  });

  it("never records the image", async () => {
    const llm = new FakeLlmClient([{ output: { recognised: ["egg"], unrecognised: [] } }]);
    const { deps, calls } = setup(llm);

    await processPhoto(PHOTO, deps);

    expect(JSON.stringify(calls)).not.toContain(PHOTO.imageBase64);
  });
});
