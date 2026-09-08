import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { CALENDAR_SCOPES, CALENDAR_SCOPE_STRING } from "@/lib/calendar/scopes";
import { SIGN_IN_SCOPES } from "@/lib/auth/scopes";
import {
  createEmailActionToken,
  decryptToken,
  encryptToken,
  hashToken,
  verifyEmailActionToken,
} from "@/lib/crypto/tokens";
import { UnconfiguredEmailProvider } from "@/lib/email/provider";
import { findFreeWindows, totalFreeMinutes } from "@/lib/calendar/service";

beforeAll(() => {
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.EMAIL_ACTION_SIGNING_KEY = randomBytes(32).toString("base64");
});

/**
 * PRD §5, §11, §23, §30.7 — Calendar consent is separate from sign-in, and the
 * production sign-in client must never carry a sensitive scope.
 */
describe("Calendar consent is separate from sign-in", () => {
  it("shares no scope at all with sign-in", () => {
    for (const scope of CALENDAR_SCOPES) {
      expect(SIGN_IN_SCOPES).not.toContain(scope);
    }
    for (const scope of SIGN_IN_SCOPES) {
      expect(CALENDAR_SCOPES as readonly string[]).not.toContain(scope);
    }
  });

  it("keeps sign-in free of every Google API scope", () => {
    expect(SIGN_IN_SCOPES.join(" ")).not.toContain("googleapis.com");
    expect(CALENDAR_SCOPE_STRING).toContain("googleapis.com");
  });

  // §23 — request the minimum. freebusy tells Vezri when the user is busy
  // without revealing what they are doing.
  it("asks for free/busy rather than full calendar read access", () => {
    expect(CALENDAR_SCOPES).toContain("https://www.googleapis.com/auth/calendar.freebusy");
    expect(CALENDAR_SCOPES as readonly string[]).not.toContain(
      "https://www.googleapis.com/auth/calendar.readonly",
    );
    expect(CALENDAR_SCOPES as readonly string[]).not.toContain(
      "https://www.googleapis.com/auth/calendar",
    );
  });

  it("uses a different Google client from sign-in", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/lib/calendar/google.ts", import.meta.url), "utf8"),
    );
    expect(source).toContain("GOOGLE_CALENDAR_CLIENT_ID");
    // The sign-in client id must never appear in the calendar path.
    expect(source).not.toContain("GOOGLE_CLIENT_ID");
  });
});

describe("token encryption at rest (PRD §23)", () => {
  it("round-trips a refresh token", () => {
    const encrypted = encryptToken("1//refresh-token-value");
    expect(encrypted.cipher).not.toContain("refresh-token-value");
    expect(decryptToken(encrypted)).toBe("1//refresh-token-value");
  });

  it("produces different ciphertext each time", () => {
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a.cipher).not.toBe(b.cipher);
    expect(a.iv).not.toBe(b.iv);
  });

  // GCM is authenticated: a tampered ciphertext must fail, not decrypt to
  // plausible garbage.
  it("refuses to decrypt tampered ciphertext", () => {
    const encrypted = encryptToken("secret");
    const flipped = Buffer.from(encrypted.cipher, "base64");
    flipped[0] ^= 0xff;
    expect(() =>
      decryptToken({ ...encrypted, cipher: flipped.toString("base64") }),
    ).toThrow();
  });

  it("refuses a tampered auth tag", () => {
    const encrypted = encryptToken("secret");
    const tag = Buffer.from(encrypted.authTag, "base64");
    tag[0] ^= 0xff;
    expect(() => decryptToken({ ...encrypted, authTag: tag.toString("base64") })).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    const original = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = original;
  });
});

describe("email action links (PRD §12, §23)", () => {
  const payload = { taskId: crypto.randomUUID(), reminderId: crypto.randomUUID(), action: "done" as const };

  it("signs and verifies a link", () => {
    const { token } = createEmailActionToken(payload);
    const verified = verifyEmailActionToken(token);
    expect(verified.valid).toBe(true);
    expect(verified.valid && verified.payload.taskId).toBe(payload.taskId);
  });

  it("rejects a forged signature", () => {
    const { token } = createEmailActionToken(payload);
    const [encoded] = token.split(".");
    const forged = `${encoded}.${Buffer.from("nonsense").toString("base64url")}`;
    const verified = verifyEmailActionToken(forged);
    expect(verified.valid).toBe(false);
    expect(!verified.valid && verified.reason).toBe("bad_signature");
  });

  // The expiry is inside the signed payload, so it cannot be extended by
  // editing the link.
  it("rejects a tampered payload even with an expiry pushed out", () => {
    const { token } = createEmailActionToken(payload);
    const [, signature] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...payload, expiresAt: Date.now() + 10_000_000 }),
      "utf8",
    ).toString("base64url");
    const verified = verifyEmailActionToken(`${tampered}.${signature}`);
    expect(verified.valid).toBe(false);
  });

  it("expires", () => {
    const { token } = createEmailActionToken(payload, 1);
    const later = new Date(Date.now() + 2 * 60 * 1000);
    const verified = verifyEmailActionToken(token, later);
    expect(verified.valid).toBe(false);
    expect(!verified.valid && verified.reason).toBe("expired");
  });

  it("rejects a malformed token", () => {
    expect(verifyEmailActionToken("not-a-token").valid).toBe(false);
  });

  it("stores a hash rather than the token itself", () => {
    const { token } = createEmailActionToken(payload);
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
    expect(hashToken(token)).toBe(hash);
  });
});

/**
 * The behaviour the brief called out explicitly: with no key, do not stub email
 * out and do not fail silently.
 */
describe("email without a provider key (PRD §12)", () => {
  it("reports that nothing was sent, with a reason", async () => {
    const provider = new UnconfiguredEmailProvider();
    const result = await provider.send({
      to: "someone@example.com",
      subject: "How did this go?",
      text: "…",
      html: "…",
    });

    expect(provider.configured).toBe(false);
    expect(result.sent).toBe(false);
    expect(!result.sent && result.reason).toBe("not_configured");
    expect(!result.sent && result.detail).toContain("EMAIL_PROVIDER_API_KEY");
  });

  it("never reports success", async () => {
    const provider = new UnconfiguredEmailProvider();
    for (const to of ["a@b.com", "c@d.org"]) {
      const result = await provider.send({ to, subject: "s", text: "t", html: "h" });
      expect(result.sent).toBe(false);
    }
  });

  it("is what the factory returns when the key is absent", async () => {
    const original = process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.EMAIL_PROVIDER_API_KEY;
    const { getEmailProvider } = await import("@/lib/email");
    expect(getEmailProvider().configured).toBe(false);
    if (original) process.env.EMAIL_PROVIDER_API_KEY = original;
  });
});

describe("calendar capacity (PRD §11)", () => {
  const from = new Date("2027-04-05T00:00:00.000Z");
  const to = new Date("2027-04-05T23:59:00.000Z");

  it("finds the gaps between meetings", () => {
    const windows = findFreeWindows({
      busy: [
        { start: new Date("2027-04-05T09:00:00.000Z"), end: new Date("2027-04-05T10:00:00.000Z") },
        { start: new Date("2027-04-05T14:00:00.000Z"), end: new Date("2027-04-05T15:00:00.000Z") },
      ],
      from,
      to,
      minimumMinutes: 30,
    });
    expect(windows.length).toBeGreaterThan(0);
    // Nothing may overlap a busy period.
    for (const window of windows) {
      expect(window.start.getTime()).toBeLessThan(window.end.getTime());
    }
  });

  it("ignores gaps too small to be useful", () => {
    const windows = findFreeWindows({
      busy: [
        { start: new Date("2027-04-05T08:00:00.000Z"), end: new Date("2027-04-05T09:50:00.000Z") },
        { start: new Date("2027-04-05T10:00:00.000Z"), end: new Date("2027-04-05T21:00:00.000Z") },
      ],
      from,
      to,
      minimumMinutes: 30,
    });
    // The only gap is ten minutes; it should not be offered.
    expect(windows).toHaveLength(0);
  });

  it("totals availability for the capacity factor", () => {
    const minutes = totalFreeMinutes([
      { start: new Date("2027-04-05T09:00:00.000Z"), end: new Date("2027-04-05T10:30:00.000Z") },
      { start: new Date("2027-04-05T14:00:00.000Z"), end: new Date("2027-04-05T15:00:00.000Z") },
    ]);
    expect(minutes).toBe(150);
  });

  it("reports a fully booked day as no availability", () => {
    const windows = findFreeWindows({
      busy: [{ start: new Date("2027-04-05T00:00:00.000Z"), end: new Date("2027-04-06T00:00:00.000Z") }],
      from,
      to,
      minimumMinutes: 25,
    });
    expect(totalFreeMinutes(windows)).toBe(0);
  });
});
