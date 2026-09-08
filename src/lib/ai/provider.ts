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

/**
 * Thrown when the model's output does not satisfy the schema.
 *
 * The message is USER-FACING: it is returned by the extract route and rendered
 * on a page written for humans. Never construct one from a provider or parser
 * error string — put the technical detail in `cause`, which is logged but
 * never sent to the browser. A user should not be reading "Expected ',' or
 * '}' after property value in JSON at position 25162".
 */
export class AIExtractionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIExtractionError";
  }
}

/**
 * The model stopped because it ran out of output budget, not because it
 * finished. A known, detectable condition — `stop_reason === "max_tokens"` —
 * and therefore something to recover from rather than let surface as a JSON
 * parse failure downstream.
 *
 * Truncated output is never partially usable: the JSON ends mid-value, so
 * there is nothing to salvage and nothing is written.
 */
/**
 * Why a call failed, so the user can be told something they can act on.
 *
 * "Vezri couldn't reach the service that reads plans" covered a bad key, a
 * rate limit, a timeout and a real outage identically. Those need four
 * different responses from the user and from us, and the generic message sent
 * a production 401 looking like a network blip for hours.
 */
export type AIFailureKind =
  | "not_configured"
  | "unauthorised"
  | "rate_limited"
  | "timed_out"
  | "unavailable"
  | "bad_request"
  | "unusable_output"
  | "truncated";

/** Thrown when the provider call itself failed, with the cause classified. */
export class AIServiceError extends AIExtractionError {
  constructor(
    message: string,
    readonly kind: AIFailureKind,
    readonly status: number | null,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "AIServiceError";
  }
}

export class AITruncationError extends AIExtractionError {
  constructor(
    message: string,
    readonly detail: { action: string; maxTokens: number; outputTokens: number },
  ) {
    super(message);
    this.name = "AITruncationError";
  }
}
