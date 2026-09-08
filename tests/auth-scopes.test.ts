import { describe, expect, it } from "vitest";
import {
  SIGN_IN_SCOPES,
  SIGN_IN_SCOPE_STRING,
  assertNoCalendarScope,
  isCalendarScope,
} from "@/lib/auth/scopes";

/**
 * PRD §5, §23, §30.7: authenticating with Google must not grant Calendar
 * access. These tests exist so that a future change which quietly appends a
 * calendar scope to sign-in fails CI instead of shipping.
 */
describe("Google sign-in scopes", () => {
  it("requests exactly openid, email and profile", () => {
    expect([...SIGN_IN_SCOPES]).toEqual(["openid", "email", "profile"]);
  });

  it("serialises to the space-delimited string Supabase expects", () => {
    expect(SIGN_IN_SCOPE_STRING).toBe("openid email profile");
  });

  it("requests no calendar scope of any kind", () => {
    for (const scope of SIGN_IN_SCOPES) {
      expect(isCalendarScope(scope)).toBe(false);
    }
    expect(SIGN_IN_SCOPE_STRING).not.toMatch(/calendar/i);
  });

  it("requests no Google API scope at all — only OpenID Connect identity", () => {
    // Every Google API scope is a googleapis.com URL. Identity scopes are bare
    // words, so this catches Drive, Gmail and Calendar in one assertion.
    for (const scope of SIGN_IN_SCOPES) {
      expect(scope).not.toContain("googleapis.com");
      expect(scope).not.toContain("https://");
    }
  });

  it("refuses to build a sign-in request that includes Calendar", () => {
    expect(() =>
      assertNoCalendarScope([...SIGN_IN_SCOPES, "https://www.googleapis.com/auth/calendar.events"]),
    ).toThrow(/never request Calendar/i);
  });

  it("recognises every Calendar scope variant Google publishes", () => {
    for (const scope of [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ]) {
      expect(isCalendarScope(scope)).toBe(true);
    }
  });
});

describe("sign-in route source (PRD §30.7)", () => {
  it("hands Supabase the scope constant rather than a literal", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/app/api/auth/google/start/route.ts", import.meta.url), "utf8"),
    );
    expect(source).toContain("SIGN_IN_SCOPE_STRING");
    expect(source).toContain("assertNoCalendarScope");
    // The word "Calendar" legitimately appears in prose and in the name of the
    // guard. What must never appear is an actual Google API scope.
    expect(source).not.toContain("googleapis.com/auth/");
  });
});
