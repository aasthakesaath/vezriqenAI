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
  /**
   * Why it failed, so the SURFACE can choose what to say.
   *
   * This is the field that was missing. Without it the provider had to write
   * the user-facing sentence itself, and it only knew about one caller — plan
   * extraction. So a billing failure on the "I'm stuck" panel rendered "Vezri
   * couldn't work with that plan. Try a clearer version, or paste the plan
   * text", which is the wrong surface AND advice no user can act on: nothing
   * they type fixes an unpaid invoice. lib/ai/failure-copy owns the wording
   * now, keyed by kind and by which screen is asking.
   */
  readonly kind: AIFailureKind;

  constructor(message: string, cause?: unknown, kind: AIFailureKind = "unusable_output") {
    super(message);
    this.name = "AIExtractionError";
    this.cause = cause;
    this.kind = kind;
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
  // --- our side, and a retry will not help ---
  /** No provider key configured. */
  | "not_configured"
  /** 401 authentication_error / 403 permission_error — our credential. */
  | "unauthorised"
  /** 402 billing_error — our account cannot pay. Nothing the user typed. */
  | "billing"
  /** 404 not_found_error — the model id we asked for is not available to us. */
  | "not_found"
  // --- our side, and a retry might help ---
  /** 429 rate_limit_error. */
  | "rate_limited"
  /** 529 overloaded_error. */
  | "overloaded"
  /** The call did not come back in time. */
  | "timed_out"
  /** 5xx, or the service could not be reached at all. */
  | "unavailable"
  // --- about what we sent ---
  /** 413 request_too_large. */
  | "too_large"
  /** 400 invalid_request_error that is genuinely about the request. */
  | "bad_request"
  /** A 200 whose body did not satisfy the schema. */
  | "unusable_output"
  /** The model ran out of output budget mid-value. */
  | "truncated";

/** Thrown when the provider call itself failed, with the cause classified. */
export class AIServiceError extends AIExtractionError {
  constructor(
    message: string,
    kind: AIFailureKind,
    readonly status: number | null,
    cause?: unknown,
  ) {
    super(message, cause, kind);
    this.name = "AIServiceError";
  }
}

export class AITruncationError extends AIExtractionError {
  constructor(
    message: string,
    readonly detail: { action: string; maxTokens: number; outputTokens: number },
  ) {
    super(message, undefined, "truncated");
    this.name = "AITruncationError";
  }
}
