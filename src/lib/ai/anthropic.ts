import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AI_MODEL, ANTHROPIC_API_KEY, ConfigurationError } from "@/lib/env";
import {
  AIExtractionError,
  AITruncationError,
  type AIProvider,
  type StructuredRequest,
} from "./provider";

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
        // Transport, auth or rate-limit failure. The detail goes to the server
        // log via `cause`; the user gets a sentence they can act on.
        throw new AIExtractionError(
          "Vezri couldn't reach the service that reads plans. Please try again in a moment.",
          error,
        );
      }

      // A refusal is a 200 with no usable output — check before reading content.
      if (response.stop_reason === "refusal") {
        throw new AIExtractionError(
          "Vezri could not process that document. If it contains sensitive personal data, try uploading just the plan section.",
        );
      }

      // THE CHECK THAT WAS MISSING. Read this before the body: a truncated
      // response contains JSON that ends mid-value, and parsing it first is
      // what turned a known limit into an unreadable parser error.
      if (response.stop_reason === "max_tokens") {
        truncation = new AITruncationError(
          "That plan is larger than Vezri can read in one pass.",
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

    throw truncation ?? new AIExtractionError("Vezri couldn't read that plan.");
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
        "Vezri read the document but couldn't turn it into a plan. Try a clearer version, or paste the plan text.",
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (error) {
      throw new AIExtractionError(
        "Vezri read the document but couldn't turn it into a plan. Try a clearer version, or paste the plan text.",
        error,
      );
    }

    // §0.6 — nothing that fails the schema is allowed near the user's data.
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new AIExtractionError(
        "Vezri read the document but couldn't turn it into a plan. Try a clearer version, or paste the plan text.",
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
