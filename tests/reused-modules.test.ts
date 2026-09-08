import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeNextDestination, DEFAULT_DESTINATION } from "@/lib/auth/next-destination";
import { sanitizePagePath, feedbackInbox, FEEDBACK_TOPICS } from "@/lib/feedback";

/**
 * The two modules ported from the sibling products rather than rewritten
 * (owner decision, 2026-09-08): Calyqen's email auth and Meriqen's feedback.
 *
 * These tests exist because both carry security properties that are easy to
 * "simplify" away by someone who does not know why they are there.
 */

describe("redirect guard, ported from Calyqen", () => {
  it("keeps an ordinary same-site path", () => {
    expect(safeNextDestination("/goals/abc/review")).toBe("/goals/abc/review");
  });

  it("falls back to onboarding rather than erroring", () => {
    expect(safeNextDestination(null)).toBe(DEFAULT_DESTINATION);
    expect(safeNextDestination(undefined)).toBe(DEFAULT_DESTINATION);
    expect(safeNextDestination("")).toBe(DEFAULT_DESTINATION);
  });

  // The whole reason the module exists: this value arrives in a URL a stranger
  // can craft and send to someone else.
  it("rejects protocol-relative URLs in both forms browsers accept", () => {
    expect(safeNextDestination("//evil.example")).toBe(DEFAULT_DESTINATION);
    expect(safeNextDestination("/\\evil.example")).toBe(DEFAULT_DESTINATION);
  });

  it("rejects anything carrying a scheme", () => {
    for (const attempt of [
      "https://evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>",
    ]) {
      expect(safeNextDestination(attempt), attempt).toBe(DEFAULT_DESTINATION);
    }
  });

  it("rejects whitespace and control characters used to split headers", () => {
    expect(safeNextDestination("/today\nLocation: https://evil.example")).toBe(
      DEFAULT_DESTINATION,
    );
    expect(safeNextDestination("/today\r\nSet-Cookie: a=b")).toBe(DEFAULT_DESTINATION);
    expect(safeNextDestination("/to day")).toBe(DEFAULT_DESTINATION);
  });

  it("trims surrounding whitespace rather than rejecting the path for it", () => {
    // Leading and trailing space are stripped before validation, so a path
    // that picked up whitespace in transit still works. Only whitespace
    // *inside* the path is a header-splitting attempt.
    expect(safeNextDestination("  /today  ")).toBe("/today");
  });

  it("lands a new account in onboarding by default (PRD 30.7)", () => {
    expect(DEFAULT_DESTINATION).toBe("/start");
  });
});

describe("sign-in errors do not confirm whether an account exists", () => {
  /**
   * A message distinguishing "no such account" from "wrong password" is an
   * account-enumeration oracle. Vezriqen holds uploaded plans, goals and
   * execution history, so confirming someone has an account here is itself a
   * disclosure. Calyqen's single vague message is kept for that reason.
   */
  it("uses one message for both causes", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
    expect(source).toContain("That email and password combination didn't work.");
    for (const leak of [
      "No account with that email",
      "no account found",
      "User not found",
      "Incorrect password",
      "Wrong password",
    ]) {
      expect(source, `must not reveal: ${leak}`).not.toContain(leak);
    }
  });

  it("confirms a password reset the same way whether or not the account exists", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
    expect(source).toContain("If an account exists for that email");
    const resetBlock = source.slice(source.indexOf("export async function requestPasswordReset"));
    const untilNext = resetBlock.slice(0, resetBlock.indexOf("export async function updatePassword"));
    expect(untilNext).not.toContain("if (error)");
  });

  it("requires a password of at least 8 characters on sign-up", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
    expect(source).toContain("password.length < 8");
  });
});

describe("feedback path sanitising, ported from Meriqen", () => {
  it("keeps an ordinary route", () => {
    expect(sanitizePagePath("/about")).toBe("/about");
    expect(sanitizePagePath("/goals/new")).toBe("/goals/new");
  });

  it("strips query and hash, which is where tokens hide", () => {
    expect(sanitizePagePath("/today?token=secret-value")).toBe("/today");
    expect(sanitizePagePath("/today#anchor")).toBe("/today");
  });

  /**
   * The case this exists for in Vezriqen: /r/<token> carries a live,
   * single-use email action token. It must never reach an inbox.
   */
  it("redacts the email action token out of an /r/ path", () => {
    const token = "eyJ0YXNrSWQiOiJhYmMxMjMi";
    const sanitised = sanitizePagePath(`/r/${token}`);
    expect(sanitised).not.toContain(token);
    expect(sanitised).toBe("/r/[id]");
  });

  it("redacts goal and document ids", () => {
    expect(sanitizePagePath("/goals/9f8e7d6c5b4a39281706abcd/review")).toBe(
      "/goals/[id]/review",
    );
  });

  it("returns null rather than guessing at anything that is not a plain path", () => {
    expect(sanitizePagePath("https://evil.example/x")).toBeNull();
    expect(sanitizePagePath("not-a-path")).toBeNull();
    expect(sanitizePagePath(null)).toBeNull();
    expect(sanitizePagePath("")).toBeNull();
  });

  it("caps the length so a long path cannot flood the email", () => {
    const long = sanitizePagePath("/" + "a".repeat(500));
    expect(long).not.toBeNull();
    expect(long!.length).toBeLessThanOrEqual(120);
  });
});

describe("feedback stays the public support path (PRD 30.8)", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/feedback/route.ts"), "utf8");

  it("takes no session and stores nothing", () => {
    expect(route).not.toContain("auth.getUser()");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".from(");
  });

  it("re-sanitises the page path server-side rather than trusting the client", () => {
    expect(route).toContain("sanitizePagePath");
  });

  // The inherited rule that matters most.
  it("never reports success when delivery failed", () => {
    expect(route).toContain("if (!result.sent)");
    expect(route).toContain("not going to pretend it did");
  });

  it("keeps the four PRD topics and a configurable inbox", () => {
    expect(FEEDBACK_TOPICS).toHaveLength(4);
    expect(FEEDBACK_TOPICS[0]).toBe("Something is broken");
    expect(feedbackInbox()).toMatch(/@/);
  });
});
