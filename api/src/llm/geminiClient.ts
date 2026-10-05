import { redact } from "../observability/redact.js";
import type { ExtractArgs, LlmClient, LlmResult } from "./client.js";

/**
 * Pinned rather than a `-latest` alias: a model that moves underneath the
 * eval changes every result with no diff to point at. The same model the
 * roadmap-city test-day generator runs on. Override with GEMINI_MODEL.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Generous for two short arrays, because on a thinking model the reasoning is
 * charged against the same budget, and a reply cut off mid-array arrives as
 * broken JSON rather than an obvious failure.
 */
const MAX_OUTPUT_TOKENS = 2048;

/** The JSON Schema keywords Gemini's response schema accepts; anything else is a 400. */
const SUPPORTED_KEYWORDS = ["description", "enum", "required", "minItems", "maxItems", "nullable"];

type JsonSchema = {
  type?: unknown;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  [keyword: string]: unknown;
};

/**
 * Translates a standard JSON Schema into the OpenAPI-flavoured subset Gemini
 * speaks: uppercase type names, a short keyword list, and an explicit
 * property order. `additionalProperties` has no equivalent and is dropped —
 * which is one reason the caller's Zod `strictObject` check still runs on
 * every answer.
 */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof schema.type === "string") out["type"] = schema.type.toUpperCase();
  for (const keyword of SUPPORTED_KEYWORDS) {
    if (schema[keyword] !== undefined) out[keyword] = schema[keyword];
  }
  if (schema.items !== undefined) out["items"] = toGeminiSchema(schema.items);
  if (schema.properties !== undefined) {
    out["properties"] = Object.fromEntries(
      Object.entries(schema.properties).map(([name, value]) => [name, toGeminiSchema(value)]),
    );
    out["propertyOrdering"] = Object.keys(schema.properties);
  }
  return out;
}

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  modelVersion?: string;
};

/**
 * `LlmClient` over the Gemini REST API, with structured output through a
 * response schema rather than a tool call.
 *
 * Plain `fetch`, no SDK, as in roadmap-city's GeminiGenerationProvider: the
 * request is one POST, and an SDK would be a dependency for nothing. Retries
 * belong to the caller; a 429 is answered straight away as a non-retryable
 * provider error, because a user is waiting and the synonym table is the
 * right answer to "not now", not a few seconds of backoff.
 *
 * Use a key from a paid (billing-enabled) project: the privacy page promises
 * the provider does not train on what is sent, and that is true of Gemini's
 * paid tier, not its free one.
 */
export function createGeminiLlmClient(deps: {
  apiKey: string;
  model?: string;
  /** Injected in tests. Production uses the global fetch. */
  fetch?: typeof fetch;
}): LlmClient {
  const model = deps.model ?? GEMINI_MODEL;
  const send = deps.fetch ?? fetch;

  return {
    enabled: true,
    model,

    async extract<T>(args: ExtractArgs<T>): Promise<LlmResult<T>> {
      const started = Date.now();
      const elapsed = () => Date.now() - started;
      const failed = (
        reason: "timeout" | "provider_error" | "invalid_output",
        retryable = false,
      ): LlmResult<T> => ({ ok: false, reason, retryable, latencyMs: elapsed() });

      const parts: Record<string, unknown>[] = [];
      if (args.image !== undefined) {
        parts.push({ inlineData: { mimeType: args.image.mediaType, data: args.image.base64 } });
      }
      parts.push({ text: args.user });

      let response: Response;
      try {
        response = await send(`${ENDPOINT_BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": deps.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: args.system }] },
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: toGeminiSchema(args.schema as JsonSchema),
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              // Mapping a sentence onto a fixed list is recall, not reasoning;
              // roadmap-city measured "low" as faster with no loss in quality.
              thinkingConfig: { thinkingLevel: "low" },
            },
          }),
          signal: AbortSignal.timeout(args.timeoutMs),
        });
      } catch (error) {
        // Read off the object rather than via `instanceof Error`: the abort
        // reason is a DOMException, which can come from another realm.
        const name: unknown =
          typeof error === "object" && error !== null ? (error as { name?: unknown }).name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          return failed("timeout");
        }
        logProviderError(null, error);
        return failed("provider_error", true);
      }

      if (!response.ok) {
        logProviderError(response.status, await response.text().catch(() => ""));
        return failed("provider_error", response.status >= 500);
      }

      let json: GeminiResponse;
      try {
        json = (await response.json()) as GeminiResponse;
      } catch {
        return failed("invalid_output");
      }

      const candidate = json.candidates?.[0];
      // Reasoning comes back as parts flagged `thought`; joined into the
      // payload it would corrupt the JSON.
      const text = (candidate?.content?.parts ?? [])
        .filter((part) => part.thought !== true)
        .map((part) => part.text ?? "")
        .join("");
      // A reply cut off at the token ceiling is still nearly valid JSON;
      // caught here so it is not mistaken for a model ignoring the schema.
      if (text === "" || candidate?.finishReason === "MAX_TOKENS") {
        return failed("invalid_output");
      }

      let value: T;
      try {
        value = args.validate(JSON.parse(text));
      } catch {
        return failed("invalid_output");
      }

      const usage = json.usageMetadata ?? {};
      return {
        ok: true,
        value,
        usage: {
          inputTokens: usage.promptTokenCount ?? 0,
          // Thinking tokens are billed as output, so they are counted as output.
          outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        },
        latencyMs: elapsed(),
        model: json.modelVersion ?? model,
      };
    },
  };
}

/** Status and message to the log only, redacted, never to the caller. */
function logProviderError(status: number | null, detail: unknown): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      event: "llm_provider_error",
      provider: "gemini",
      status,
      message: redact(detail instanceof Error ? detail.message : detail),
    }),
  );
}
