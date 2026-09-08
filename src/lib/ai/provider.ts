import type { z } from "zod";

/**
 * Provider abstraction (PRD §22, §27 "LLM vendor: provider-agnostic").
 *
 * Deliberately narrow: one method, and it only ever returns data that has
 * already been validated against a schema. There is no "give me some text"
 * escape hatch, which is what keeps §0.6 — free-form output must never mutate
 * user data — true by construction rather than by discipline.
 */

export type VisionInput = {
  /** base64, no data: prefix */
  data: string;
  mediaType: "image/jpeg" | "image/png";
};

export type StructuredRequest<T extends z.ZodTypeAny> = {
  /** Named for the AI action log (§21 AIActionLog.action_type). */
  action: string;
  system: string;
  prompt: string;
  schema: T;
  image?: VisionInput;
  maxTokens?: number;
  /** Depth/spend trade-off. Extraction is worth more effort than a summary. */
  effort?: "low" | "medium" | "high";
};

export type StructuredResult<T> = {
  data: T;
  modelVersion: string;
  usage: { inputTokens: number; outputTokens: number };
};

export interface AIProvider {
  readonly name: string;
  readonly modelVersion: string;
  generateStructured<T extends z.ZodTypeAny>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResult<z.infer<T>>>;
}

/** Thrown when the model's output does not satisfy the schema. */
export class AIExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIExtractionError";
  }
}
