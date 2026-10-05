import type { Env } from "../config/env.js";
import { createAnthropicLlmClient } from "./anthropicClient.js";
import { disabledLlmClient } from "./client.js";
import type { LlmClient } from "./client.js";
import { createFallbackLlmClient } from "./fallbackClient.js";
import { createGeminiLlmClient } from "./geminiClient.js";

/**
 * The model client this deployment runs, from its environment.
 *
 * Off unless LLM_ENABLED is true. Then each provider in LLM_PROVIDERS that has
 * a key becomes a client, in the order listed; one listed without a key is
 * skipped with a warning rather than failing the boot. No usable provider at
 * all is the disabled client, so the app still works on the synonym table.
 */
export function createLlmFromEnv(
  env: Pick<
    Env,
    "LLM_ENABLED" | "LLM_API_KEY" | "LLM_PROVIDERS" | "GEMINI_API_KEY" | "GEMINI_MODEL"
  >,
  warn: (message: string) => void = (message) => {
    console.warn(message);
  },
): LlmClient {
  if (!env.LLM_ENABLED) {
    return disabledLlmClient;
  }

  const clients = env.LLM_PROVIDERS.flatMap((provider): LlmClient[] => {
    if (provider === "anthropic") {
      if (env.LLM_API_KEY === undefined) {
        warn("LLM_PROVIDERS lists anthropic but LLM_API_KEY is not set; skipping it");
        return [];
      }
      return [createAnthropicLlmClient({ apiKey: env.LLM_API_KEY })];
    }
    if (env.GEMINI_API_KEY === undefined) {
      warn("LLM_PROVIDERS lists gemini but GEMINI_API_KEY is not set; skipping it");
      return [];
    }
    return [
      createGeminiLlmClient({
        apiKey: env.GEMINI_API_KEY,
        ...(env.GEMINI_MODEL !== undefined && { model: env.GEMINI_MODEL }),
      }),
    ];
  });

  if (clients.length === 0) {
    warn("LLM_ENABLED is set but no provider has a key; AI pantry features are off");
    return disabledLlmClient;
  }
  return createFallbackLlmClient(clients);
}
