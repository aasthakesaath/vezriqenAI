import "server-only";

import { createAnthropicProvider } from "./anthropic";
import type { AIProvider } from "./provider";

/**
 * Resolves the configured provider (PRD §22, §27).
 *
 * Adding a second vendor means adding a branch here and an implementation of
 * AIProvider — no call site changes, because nothing above this line knows
 * which model answered.
 */
export function getAIProvider(): AIProvider {
  const configured = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  switch (configured) {
    case "anthropic":
      return createAnthropicProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${configured}". Supported: anthropic.`);
  }
}

export type { AIProvider } from "./provider";
export { AIExtractionError } from "./provider";
