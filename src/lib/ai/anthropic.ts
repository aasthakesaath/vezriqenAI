import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AI_MODEL, ANTHROPIC_API_KEY, ConfigurationError } from "@/lib/env";
import { AIExtractionError, type AIProvider, type StructuredRequest } from "./provider";

/**
 * Anthropic implementation of the provider abstraction.
 *
 * Uses messages.parse() with a Zod output format so the model is constrained to
 * the schema at generation time and the SDK validates the result. Adaptive
 * thinking is on: extraction is a reasoning task, and the quality difference on
 * dependency and lead-time inference is what §9 depends on.
 */
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

    let response;
    try {
      response = await this.client.messages.parse({
        model: AI_MODEL,
        max_tokens: request.maxTokens ?? 16000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: request.effort ?? "high",
          format: zodOutputFormat(request.schema),
        },
        system: request.system,
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      throw new AIExtractionError(
        error instanceof Error ? error.message : "The AI provider request failed.",
        error,
      );
    }

    // A refusal is a 200 with no usable output — check before reading content.
    if (response.stop_reason === "refusal") {
      throw new AIExtractionError(
        "Vezri could not process that document. If it contains sensitive personal data, try uploading just the plan section.",
      );
    }

    if (!response.parsed_output) {
      throw new AIExtractionError(
        "Vezri read the document but couldn't turn it into a plan. Try a clearer version, or paste the plan text.",
      );
    }

    return {
      data: response.parsed_output as z.infer<T>,
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
