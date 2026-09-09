import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase, FAKE_USER_ID } from "./helpers/fake-supabase";
import { createEmailActionToken, hashToken } from "@/lib/crypto/tokens";
import { redeemEmailAction } from "@/lib/reminders/redeem";
import { buildReminderEmail } from "@/lib/email/templates";
import RedeemConfirm from "@/components/app/RedeemConfirm";
import {
  EMAIL_ACTION_CONFIRMED,
  RETIRED_EMAIL_ACTION_MESSAGE,
} from "@/lib/reminders/email-actions";

/**
 * A link in an inbox outlives the deploy that retires it.
 *
 * Someone tapping "Snooze a day" on an email sent last night is doing nothing
 * wrong, and what they get back has to say so: a plain sentence, nothing
 * written, and no error page. This is the test for that whole path, because
 * every part of it is easy to get subtly wrong — refusing AFTER the first
 * write, or answering "that link isn't valid" for a link that is perfectly
 * valid and simply asks for something that no longer exists.
 */

// At module scope, not in beforeAll: the email is built while the suite is
// being collected, which happens first.
process.env.EMAIL_ACTION_SIGNING_KEY ??= randomBytes(32).toString("base64");

const TASK = "11111111-1111-4111-8111-111111111111";
const REMINDER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-10T09:00:00.000Z");

function seed(action: string) {
  const { token } = createEmailActionToken({
    taskId: TASK,
    reminderId: REMINDER,
    // The union no longer admits a retired action; a token issued before the
    // change did, which is exactly the case under test.
    action: action as "done",
  });
  const db = fakeSupabase({
    email_action_tokens: [
      {
        id: "tok-1",
        user_id: FAKE_USER_ID,
        task_id: TASK,
        reminder_id: REMINDER,
        action,
        token_hash: hashToken(token),
        expires_at: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
        used_at: null,
      },
    ],
    check_ins: [],
    tasks: [{ id: TASK, status: "not_started", completed_at: null }],
    reminders: [{ id: REMINDER, response: null, responded_at: null }],
  });
  return { token, db };
}

describe("an old Snooze link", () => {
  it("is refused, and writes nothing at all", async () => {
    const { token, db } = seed("snooze");

    const outcome = await redeemEmailAction({ admin: db.client, token, now: NOW });

    expect(outcome).toEqual({ ok: false, reason: "retired_action" });

    // Nothing recorded, nothing moved, and the token NOT burned — burning it
    // would make the second tap say "you've already answered this one", which
    // is a different and untrue story.
    expect(db.db.check_ins).toHaveLength(0);
    expect(db.db.tasks[0]!.status).toBe("not_started");
    expect(db.db.reminders[0]!.response).toBeNull();
    expect(db.db.email_action_tokens[0]!.used_at).toBeNull();
  });

  it("says what happened in plain words, and blames nobody", () => {
    expect(RETIRED_EMAIL_ACTION_MESSAGE).toMatch(/retired/i);
    expect(RETIRED_EMAIL_ACTION_MESSAGE).toMatch(/nothing has been changed/i);
    // Not "invalid", not "expired" — the link is neither, and telling someone
    // it is sends them looking for a problem that is not theirs.
    expect(RETIRED_EMAIL_ACTION_MESSAGE).not.toMatch(/invalid|error|expired|failed/i);
  });

  it("is a 410 in the API's map, never a 500", () => {
    const route = readFileSync("src/app/api/reminders/redeem/route.ts", "utf8");
    expect(route).toContain("retired_action: 410");
    expect(route).not.toMatch(/status:\s*500/);
  });
});

describe("the three links an email carries now", () => {
  const email = buildReminderEmail({
    recipientName: "Nikita",
    taskTitle: "Request the recommendation letter",
    goalTitle: "Summer programme application",
    rationale: "Someone else has to reply before this can close.",
    startBy: new Date(Date.UTC(2026, 9, 10)),
    deadline: new Date(Date.UTC(2026, 10, 1)),
    taskId: TASK,
    reminderId: REMINDER,
    siteUrl: "https://www.vezriqen.com",
    responseRequired: true,
  });

  it("offers Done, Not done and I'm stuck", () => {
    expect(email.tokens.map((t) => t.action)).toEqual(["done", "not_done", "stuck"]);
    for (const label of ["Done", "Not done", "I'm stuck"]) {
      expect(email.html).toContain(label);
    }
  });

  it("offers no Snooze anywhere in the message", () => {
    for (const body of [email.subject, email.text, email.html]) {
      expect(body).not.toMatch(/snooze/i);
    }
  });

  it("records a not-done link so it can reach the coach", async () => {
    const { token, db } = seed("not_done");
    const outcome = await redeemEmailAction({ admin: db.client, token, now: NOW });

    expect(outcome.ok).toBe(true);
    // §13 — from an inbox as much as from the app: it opens the coach and
    // reschedules nothing.
    expect(outcome.ok && outcome.needsCoach).toBe(true);
    expect(db.db.check_ins[0]!.state).toBe("not_done");
    expect(db.db.tasks[0]!.status).toBe("not_done");
    expect(db.db.tasks[0]!.completed_at).toBeNull();
  });

  it("confirms each one in words that do not promise a reschedule", () => {
    for (const action of ["not_done", "stuck"] as const) {
      const markup = renderToStaticMarkup(<RedeemConfirm token="t" action={action} />);
      expect(markup).toBeTruthy();
      expect(EMAIL_ACTION_CONFIRMED[action]).toMatch(/nothing has been moved/i);
    }
  });
});
