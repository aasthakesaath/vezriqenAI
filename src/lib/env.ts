/**
 * Environment access with one place to answer "is this configured?".
 *
 * Nothing here throws at module load. A missing key must degrade to a clear,
 * visible error at the point of use (PRD §23, and the feedback-API precedent
 * set in Milestone 1) rather than crashing a page render or — worse — silently
 * behaving as though the feature worked.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const SUPABASE_URL = read("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** Server-only. Never import this into a client component. */
export const SUPABASE_SERVICE_ROLE_KEY = read("SUPABASE_SERVICE_ROLE_KEY");

export const ANTHROPIC_API_KEY = read("ANTHROPIC_API_KEY");
export const AI_MODEL = read("AI_MODEL") ?? "claude-opus-5";

export const SITE_URL = read("NEXT_PUBLIC_SITE_URL") ?? "https://www.vezriqen.com";

/** Supabase auth is configured when the browser pair is present. */
export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** AI extraction is configured when a provider key is present (PRD §22). */
export const AI_CONFIGURED = Boolean(ANTHROPIC_API_KEY);

export class ConfigurationError extends Error {
  readonly status = 503;
  constructor(what: string, vars: string[]) {
    super(`${what} is not configured. Set ${vars.join(" and ")}.`);
    this.name = "ConfigurationError";
  }
}

export function requireSupabaseBrowserConfig(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ConfigurationError("Supabase", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}
