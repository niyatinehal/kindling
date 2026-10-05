import Anthropic from "@anthropic-ai/sdk";

import { redact } from "../observability/redact.js";
import type { ExtractArgs, LlmClient, LlmResult } from "./client.js";

/**
 * Small and fast: the job is mapping a sentence onto a fixed list, which does
 * not need a large model, and the user is waiting on the screen.
 */
export const ANTHROPIC_MODEL = "claude-haiku-4-5";

/** The answer is two short arrays. Generous enough never to truncate them. */
const MAX_TOKENS = 1024;

const TOOL_NAME = "record_result";

/** The part of the SDK this file uses, so a test can stand in for it. */
export type MessagesApi = Pick<Anthropic["messages"], "create">;

/**
 * `LlmClient` over the Anthropic Messages API, using a forced tool call as the
 * structured output.
 *
 * The tool's input schema is the output contract, and `strict: true` makes the
 * provider hold the model to it — for the pantry, an enum of known keys, so the
 * model cannot name an ingredient the app does not know. The caller's `validate`
 * runs on the result anyway: a provider-side constraint reduces bad output, it
 * is never trusted alone.
 *
 * Retries belong to the caller, not the SDK (`maxRetries: 0`): the SDK would
 * also retry timeouts and 429s, and here a timeout must never be retried.
 */
export function createAnthropicLlmClient(deps: {
  apiKey: string;
  model?: string;
  /** Injected in tests. Production builds the real SDK client. */
  messages?: MessagesApi;
}): LlmClient {
  const model = deps.model ?? ANTHROPIC_MODEL;
  const messages = deps.messages ?? new Anthropic({ apiKey: deps.apiKey, maxRetries: 0 }).messages;

  return {
    enabled: true,
    model,

    async extract<T>(args: ExtractArgs<T>): Promise<LlmResult<T>> {
      const started = Date.now();
      const elapsed = () => Date.now() - started;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, args.timeoutMs);

      try {
        const message = await messages.create(
          {
            model,
            max_tokens: MAX_TOKENS,
            system: args.system,
            messages: [
              {
                role: "user",
                content:
                  args.image === undefined
                    ? args.user
                    : [
                        {
                          type: "image",
                          source: {
                            type: "base64",
                            media_type: args.image.mediaType,
                            data: args.image.base64,
                          },
                        },
                        { type: "text", text: args.user },
                      ],
              },
            ],
            tools: [
              {
                name: TOOL_NAME,
                description: "Record the result. Always call this exactly once.",
                input_schema: args.schema as Anthropic.Tool.InputSchema,
                strict: true,
              },
            ],
            tool_choice: { type: "tool", name: TOOL_NAME },
          },
          { signal: controller.signal, timeout: args.timeoutMs, maxRetries: 0 },
        );

        const call = message.content.find(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === TOOL_NAME,
        );
        if (call === undefined) {
          return { ok: false, reason: "invalid_output", retryable: false, latencyMs: elapsed() };
        }

        let value: T;
        try {
          value = args.validate(call.input);
        } catch {
          return { ok: false, reason: "invalid_output", retryable: false, latencyMs: elapsed() };
        }

        return {
          ok: true,
          value,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
          latencyMs: elapsed(),
          model: message.model,
        };
      } catch (error) {
        return { ...classify(error), latencyMs: elapsed() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Turns an SDK error into a failure reason. Order matters: a timeout is a
 * subclass of a connection error, and must not be mistaken for a retryable one.
 */
function classify(error: unknown): {
  ok: false;
  reason: "timeout" | "provider_error";
  retryable: boolean;
} {
  if (
    error instanceof Anthropic.APIUserAbortError ||
    error instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return { ok: false, reason: "timeout", retryable: false };
  }

  // Logged, never returned: the status and message help an operator, and are
  // none of the user's business. Redacted because a provider message can echo
  // back a key prefix or anything else that was interpolated into it.
  console.warn(
    JSON.stringify({
      level: "warn",
      event: "llm_provider_error",
      status: providerStatus(error),
      message: redact(error instanceof Error ? error.message : error),
    }),
  );

  if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return { ok: false, reason: "provider_error", retryable: true };
  }
  return { ok: false, reason: "provider_error", retryable: false };
}

function providerStatus(error: unknown): number | null {
  const status: unknown = error instanceof Anthropic.APIError ? error.status : undefined;
  return typeof status === "number" ? status : null;
}
