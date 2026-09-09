import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import type { EmailAction, RetiredEmailAction } from "@/lib/reminders/email-actions";

/**
 * Encryption for stored OAuth tokens (PRD §23 "Encrypt tokens/secrets at rest").
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding plausible garbage. The key lives only in the environment, so a
 * database dump on its own reveals nothing — which is the property that makes
 * "encrypted at rest" mean something beyond a checkbox.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard
const KEY_LENGTH = 32;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

function loadKey(envVar: string): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    throw new EncryptionKeyError(
      `${envVar} is not set. Generate one with: openssl rand -base64 32`,
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new EncryptionKeyError(
      `${envVar} must decode to ${KEY_LENGTH} bytes; got ${key.length}. Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export type EncryptedValue = {
  cipher: string;
  iv: string;
  authTag: string;
};

export function encryptToken(
  plaintext: string,
  envVar = "CALENDAR_TOKEN_ENCRYPTION_KEY",
): EncryptedValue {
  const key = loadKey(envVar);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptToken(
  value: EncryptedValue,
  envVar = "CALENDAR_TOKEN_ENCRYPTION_KEY",
): string {
  const key = loadKey(envVar);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(value.cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Signed, short-lived tokens for email action links (PRD §12, §23).
 *
 * The payload travels in the URL so the endpoint stays stateless on read, and
 * the signature covers the expiry — an expired link cannot be extended by
 * editing it. The database row is the replay guard: consuming a link stamps
 * used_at, so a forwarded email cannot act twice.
 */
export type EmailActionPayload = {
  taskId: string;
  reminderId: string | null;
  /**
   * Retired actions are still PARSED, deliberately. A link sitting in an inbox
   * from before "Snooze a day" was cut is a genuine, correctly signed token,
   * and the honest answer to it is "that button is gone" rather than "that
   * link isn't valid" — which would send someone looking for a problem that
   * is not theirs. What refuses it is the action check, not the signature.
   */
  action: EmailAction | RetiredEmailAction;
  expiresAt: number;
};

const EMAIL_KEY_VAR = "EMAIL_ACTION_SIGNING_KEY";

function signPayload(encoded: string): string {
  const secret = process.env[EMAIL_KEY_VAR];
  if (!secret) {
    throw new EncryptionKeyError(
      `${EMAIL_KEY_VAR} is not set. Generate one with: openssl rand -base64 32`,
    );
  }
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createEmailActionToken(
  payload: Omit<EmailActionPayload, "expiresAt">,
  ttlMinutes = 60 * 48,
): { token: string; expiresAt: Date } {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  const full: EmailActionPayload = { ...payload, expiresAt };
  const encoded = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return { token: `${encoded}.${signPayload(encoded)}`, expiresAt: new Date(expiresAt) };
}

export type TokenVerification =
  | { valid: true; payload: EmailActionPayload }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyEmailActionToken(token: string, now = new Date()): TokenVerification {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };

  const [encoded, signature] = parts as [string, string];

  let expected: string;
  try {
    expected = signPayload(encoded);
  } catch {
    return { valid: false, reason: "bad_signature" };
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Constant-time compare; length check first because timingSafeEqual throws
  // on a mismatch, which would itself be a timing signal.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload: EmailActionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (typeof payload.expiresAt !== "number" || payload.expiresAt < now.getTime()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, payload };
}

/** Stored instead of the token itself, so a database leak cannot forge links. */
export function hashToken(token: string): string {
  return createHmac("sha256", "vezriqen-email-action").update(token).digest("hex");
}
