import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AI_MODEL, ANTHROPIC_API_KEY, ConfigurationError } from "@/lib/env";
import {
  AIExtractionError,
  AIServiceError,
  AITruncationError,
  type AIFailureKind,
  type AIProvider,
  type StructuredRequest,
} from "./provider";

/**
 * Classifies a provider failure. It does NOT write the sentence the user sees.
 *
 * It used to. That is how a billing failure came to say "Vezri couldn't work
 * with that plan. Try a clearer version, or paste the plan text" on the "I'm
 * stuck" panel: the copy was written when extraction was the only caller, and
 * every surface added since inherited it. The provider cannot know which
 * screen is asking, so it reports a KIND and lib/ai/failure-copy chooses the
 * words. The `message` set here is a fallback for anything that renders an
 * AIServiceError without consulting that table.
 *
 * THE ERROR TYPE IS READ BEFORE THE STATUS. Every Anthropic SDK error exposes
 * `.type` — "billing_error", "rate_limit_error", "overloaded_error" — and the
 * API reference is explicit that this is how to classify, rather than by
 * status code. Status is the fallback for a transport error that never got a
 * typed body.
 */
function classify(error: unknown, action: string): AIServiceError {
  const e = error as { status?: number; name?: string; message?: string; type?: string };
  const status = typeof e?.status === "number" ? e.status : null;
  const name = e?.name ?? "";
  const type = typeof e?.type === "string" ? e.type : null;
  const detail = e?.message ?? "";

  const kind = classifyKind({ type, status, name, detail });

  console.error(
    `[ai] ${action} failed: kind=${kind} type=${type ?? "none"} status=${status ?? "none"} ` +
      `name=${name || "unknown"} :: ${detail || String(error)}`,
  );

  return new AIServiceError(FALLBACK_MESSAGE[kind] ?? FALLBACK_MESSAGE.unavailable, kind, status, error);
}

/**
 * A 400 that is really a billing problem.
 *
 * The canonical billing failure is 402 `billing_error` and is caught by type
 * above. This is the other shape it arrives in: an `invalid_request_error`
 * whose message is about the credit balance rather than about the request. It
 * is checked only inside the 400 branch, so it cannot swallow a rate limit,
 * and it exists because getting this one wrong is what told a user to rewrite
 * input that was never read.
 */
const BILLING_IN_A_400 = /credit balance|insufficient (?:credit|funds)|billing|payment required|purchase (?:more )?credits/i;

function classifyKind(signal: {
  type: string | null;
  status: number | null;
  name: string;
  detail: string;
}): AIFailureKind {
  const { type, status, name, detail } = signal;

  // ---- By error type, which is what the API documents for this. ----------
  switch (type) {
    case "billing_error":
      return "billing";
    case "authentication_error":
    case "permission_error":
      return "unauthorised";
    case "not_found_error":
      return "not_found";
    case "rate_limit_error":
      return "rate_limited";
    case "overloaded_error":
      return "overloaded";
    case "request_too_large":
      return "too_large";
    case "api_error":
      return "unavailable";
    case "invalid_request_error":
      return BILLING_IN_A_400.test(detail) ? "billing" : "bad_request";
  }

  // ---- By status, for a failure that carried no typed body. --------------
  if (status === 401 || status === 403) return "unauthorised";
  if (status === 402) return "billing";
  if (status === 404) return "not_found";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status === 529) return "overloaded";
  if (status === 400 || status === 422) {
    return BILLING_IN_A_400.test(detail) ? "billing" : "bad_request";
  }
  if (status !== null && status >= 500) return "unavailable";

  if (
    name.includes("Timeout") ||
    name === "APIConnectionTimeoutError" ||
    /timeout|timed out|aborted/i.test(detail)
  ) {
    return "timed_out";
  }

  return "unavailable";
}

/**
 * Used only when something renders an AIServiceError without going through
 * lib/ai/failure-copy. Deliberately surface-neutral: not one of these
 * mentions a plan, a document, or anything the reader might try to edit.
 */
const FALLBACK_MESSAGE: Record<string, string> = {
  not_configured: "Vezri's AI service isn't switched on yet.",
  unauthorised: "Vezri can't get into its AI service right now.",
  billing: "Vezri's AI service is unavailable right now — a billing problem on our side.",
  not_found: "Vezri asked its AI service for something it no longer offers.",
  rate_limited: "Vezri is handling a lot at the moment. Try again in a minute.",
  overloaded: "Vezri's AI service is busy right now. Try again in a moment.",
  timed_out: "That took longer than Vezri could wait.",
  too_large: "That was larger than Vezri could take in one go.",
  bad_request: "Vezri couldn't work with what it was given.",
  unavailable: "Vezri couldn't reach its AI service. Try again in a moment.",
};

/**
 * Anthropic implementation of the provider abstraction.
 *
 * Uses output_config with a Zod format so the model is constrained to the
 * schema at generation time, then parses and validates the result here.
 *
 * Deliberately NOT messages.parse(): parse() decodes the JSON inside the SDK
 * and throws on failure, which means a response that was CUT OFF at max_tokens
 * surfaces as "Failed to parse structured output as JSON: Expected ',' or '}'
 * ... at position 25162" with the real cause — a stop_reason we never looked
 * at — lost. That is a production bug we shipped. Reading stop_reason before
 * touching the body makes truncation a condition we detect and recover from
 * instead of a parser error we mistranslate.
 *
 * Streaming, because the SDK refuses a non-streaming request whose max_tokens
 * implies it could run past ten minutes. finalMessage() gives back the same
 * assembled Message — stop_reason and usage included — so the truncation check
 * is unchanged; streaming only removes an artificial ceiling on the budget.
 */

/**
 * Output budget per call. Sized for one PASS of extraction, not a whole plan —
 * build.ts splits a large document into a structure pass and per-milestone task
 * passes precisely so that no single call has to emit an unbounded amount.
 */
const DEFAULT_MAX_TOKENS = 16000;

/**
 * One escalation before giving up. A pass that truncates at 16k is unusual
 * (the caller is meant to have bounded it); retrying once at double the budget
 * rescues the genuinely dense outlier without making every call cost double.
 */
const ESCALATED_MAX_TOKENS = 28000;

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly modelVersion = AI_MODEL;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateStructured<T extends z.ZodTypeAny>(request: StructuredRequest<T>) {
    const content: Anthropic.ContentBlockParam[] = [];

    // Image first, then the instruction — the model attends better to a
    // question asked after the material it refers to.
    if (request.image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: request.image.mediaType,
          data: request.image.data,
        },
      });
    }
    content.push({ type: "text", text: request.prompt });

    // An explicit maxTokens from the caller is a decision, not a default, so
    // it is not silently escalated.
    const budgets = request.maxTokens
      ? [request.maxTokens]
      : [DEFAULT_MAX_TOKENS, ESCALATED_MAX_TOKENS];

    let truncation: AITruncationError | null = null;

    for (const maxTokens of budgets) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages
          .stream({
            model: AI_MODEL,
            max_tokens: maxTokens,
            thinking: { type: "adaptive" },
            output_config: {
              effort: request.effort ?? "high",
              format: zodOutputFormat(request.schema),
            },
            system: request.system,
            messages: [{ role: "user", content }],
          })
          .finalMessage();
      } catch (error) {
        // Classified, and logged with its status. The detail stays server-side
        // on `cause` and in the log line; the user gets a sentence naming what
        // to do about THIS failure rather than one covering four of them.
        throw classify(error, request.action);
      }

      // A refusal is a 200 with no usable output — check before reading content.
      if (response.stop_reason === "refusal") {
        // About what we sent, so `bad_request` — and the sentence comes from
        // the surface, which knows whether "what we sent" was a document the
        // user uploaded or a task title we assembled ourselves.
        throw new AIExtractionError(
          "Vezri couldn't work with what it was given.",
          undefined,
          "bad_request",
        );
      }

      // THE CHECK THAT WAS MISSING. Read this before the body: a truncated
      // response contains JSON that ends mid-value, and parsing it first is
      // what turned a known limit into an unreadable parser error.
      if (response.stop_reason === "max_tokens") {
        truncation = new AITruncationError(
          // Neutral: the surface knows whether "larger" means a document or
          // a task's worth of steps. See lib/ai/failure-copy.
          "That was larger than Vezri could finish in one pass.",
          {
            action: request.action,
            maxTokens,
            outputTokens: response.usage.output_tokens,
          },
        );
        console.warn(
          `[ai] ${request.action} hit the output limit (${response.usage.output_tokens}/${maxTokens} tokens).` +
            (maxTokens === budgets[budgets.length - 1]
              ? " No budget left to escalate to."
              : " Retrying with a larger budget."),
        );
        continue;
      }

      return this.decode(response, request);
    }

    throw truncation ?? new AIExtractionError("Vezri couldn't finish that.");
  }

  /**
   * Decode a COMPLETE response. Only ever called once stop_reason has been
   * checked, so a failure here is genuinely malformed output rather than a
   * response we cut off ourselves.
   */
  private decode<T extends z.ZodTypeAny>(
    response: Anthropic.Message,
    request: StructuredRequest<T>,
  ): { data: z.infer<T>; modelVersion: string; usage: { inputTokens: number; outputTokens: number } } {
    const body = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!body.trim()) {
      throw new AIExtractionError(
        // Surface-neutral on purpose. This is the default `unusable_output`
        // kind; lib/ai/failure-copy turns it into the sentence for whichever
        // screen asked. Naming a document here is what put extraction copy on
        // a task card.
        "Vezri couldn't use what came back.",
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (error) {
      throw new AIExtractionError(
        // Surface-neutral on purpose. This is the default `unusable_output`
        // kind; lib/ai/failure-copy turns it into the sentence for whichever
        // screen asked. Naming a document here is what put extraction copy on
        // a task card.
        "Vezri couldn't use what came back.",
        error,
      );
    }

    // §0.6 — nothing that fails the schema is allowed near the user's data.
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new AIExtractionError(
        // Surface-neutral on purpose. This is the default `unusable_output`
        // kind; lib/ai/failure-copy turns it into the sentence for whichever
        // screen asked. Naming a document here is what put extraction copy on
        // a task card.
        "Vezri couldn't use what came back.",
        parsed.error,
      );
    }

    return {
      data: parsed.data as z.infer<T>,
      modelVersion: AI_MODEL,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

export function createAnthropicProvider(): AIProvider {
  if (!ANTHROPIC_API_KEY) {
    throw new ConfigurationError("AI extraction", ["ANTHROPIC_API_KEY"]);
  }
  return new AnthropicProvider(ANTHROPIC_API_KEY);
}
