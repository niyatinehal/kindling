import type { Env } from "../config/env.js";
import { disabledLlmClient } from "./client.js";
import type { LlmClient } from "./client.js";
import { createGeminiLlmClient } from "./geminiClient.js";

/**
 * The model client this deployment runs, from its environment: Gemini when
 * LLM_ENABLED is true and GEMINI_API_KEY is set, and otherwise the disabled
 * client, so the app still works on the synonym table. Switched on without a
 * key is "off" with a warning, not a failed boot.
 */
export function createLlmFromEnv(
  env: Pick<Env, "LLM_ENABLED" | "GEMINI_API_KEY" | "GEMINI_MODEL">,
  warn: (message: string) => void = (message) => {
    console.warn(message);
  },
): LlmClient {
  if (!env.LLM_ENABLED) {
    return disabledLlmClient;
  }
  if (env.GEMINI_API_KEY === undefined) {
    warn("LLM_ENABLED is set but GEMINI_API_KEY is not; AI pantry features are off");
    return disabledLlmClient;
  }
  return createGeminiLlmClient({
    apiKey: env.GEMINI_API_KEY,
    ...(env.GEMINI_MODEL !== undefined && { model: env.GEMINI_MODEL }),
  });
}
