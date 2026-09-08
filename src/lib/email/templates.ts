import { createEmailActionToken } from "@/lib/crypto/tokens";
import { formatLongDayKey } from "@/lib/time";
import { toDayKey } from "@/lib/time-zone";

/**
 * Reminder emails (PRD §12).
 *
 * Action emails carry secure deep links for Done, Snooze and I'm stuck. The
 * links are HMAC-signed and short-lived (§23), and each is single-use, so a
 * forwarded email cannot act twice.
 *
 * Tone follows §20 and §4.6: calm, specific, no guilt. Missing work is
 * information, not a failing.
 */

export type ReminderEmailInput = {
  recipientName: string | null;
  taskTitle: string;
  goalTitle: string;
  rationale: string | null;
  startBy: Date | null;
  deadline: Date | null;
  taskId: string;
  reminderId: string;
  siteUrl: string;
  responseRequired: boolean;
};

/**
 * Every user-visible date in the product goes through @/lib/time.
 *
 * A start-by date is a calendar day, so it is formatted zone-free. Formatting
 * it in a zone would print the day before for every reader west of Greenwich.
 */
function formatDate(date: Date | null): string | null {
  const day = toDayKey(date);
  return day ? formatLongDayKey(day) : null;
}

function actionLink(
  input: ReminderEmailInput,
  action: "done" | "snooze" | "stuck",
): { url: string; token: string; expiresAt: Date } {
  const { token, expiresAt } = createEmailActionToken({
    taskId: input.taskId,
    reminderId: input.reminderId,
    action,
  });
  return { url: `${input.siteUrl}/r/${encodeURIComponent(token)}`, token, expiresAt };
}

export function buildReminderEmail(input: ReminderEmailInput) {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
  const when = formatDate(input.startBy) ?? formatDate(input.deadline);

  // Heads-up: informational, no response required (§12 A).
  if (!input.responseRequired) {
    const text = [
      greeting,
      "",
      `${input.taskTitle} is coming up${when ? ` — ${when}` : ""}.`,
      input.rationale ? `Why it matters: ${input.rationale}` : null,
      "",
      `Nothing to reply to. It's on your Today screen when you're ready: ${input.siteUrl}/today`,
      "",
      "— Vezri",
    ]
      .filter((line) => line !== null)
      .join("\n");

    return {
      subject: `Coming up: ${input.taskTitle}`,
      text,
      html: renderHtml({
        greeting,
        heading: input.taskTitle,
        body: [
          `This is coming up${when ? ` — ${when}` : ""}.`,
          input.rationale ?? "",
        ].filter(Boolean),
        goalTitle: input.goalTitle,
        actions: [{ label: "Open Today", url: `${input.siteUrl}/today`, primary: true }],
        footer: "Nothing to reply to — this is just a heads-up.",
      }),
      tokens: [] as Array<{ action: "done" | "snooze" | "stuck"; token: string; expiresAt: Date }>,
    };
  }

  // Action checkpoint: the user closes the loop (§12 B).
  const done = actionLink(input, "done");
  const snooze = actionLink(input, "snooze");
  const stuck = actionLink(input, "stuck");

  const text = [
    greeting,
    "",
    `How did this go? ${input.taskTitle}`,
    input.rationale ? `(${input.rationale})` : null,
    "",
    `Done: ${done.url}`,
    `Snooze a day: ${snooze.url}`,
    `I'm stuck: ${stuck.url}`,
    "",
    `Or open Vezriqen: ${input.siteUrl}/today`,
    "",
    "If it didn't happen, that's useful too — Vezri will help you find the smallest way forward.",
    "",
    "— Vezri",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    subject: `How did this go? ${input.taskTitle}`,
    text,
    html: renderHtml({
      greeting,
      heading: input.taskTitle,
      body: [input.rationale ?? "", "How did it go?"].filter(Boolean),
      goalTitle: input.goalTitle,
      actions: [
        { label: "Done", url: done.url, primary: true },
        { label: "Snooze a day", url: snooze.url, primary: false },
        { label: "I'm stuck", url: stuck.url, primary: false },
      ],
      footer:
        "If it didn't happen, that's useful too — Vezri will help you find the smallest way forward.",
    }),
    tokens: [
      { action: "done" as const, token: done.token, expiresAt: done.expiresAt },
      { action: "snooze" as const, token: snooze.token, expiresAt: snooze.expiresAt },
      { action: "stuck" as const, token: stuck.token, expiresAt: stuck.expiresAt },
    ],
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(input: {
  greeting: string;
  heading: string;
  body: string[];
  goalTitle: string;
  actions: Array<{ label: string; url: string; primary: boolean }>;
  footer: string;
}): string {
  const buttons = input.actions
    .map(
      (action) =>
        `<a href="${escapeHtml(action.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 20px;border-radius:999px;font-weight:600;font-size:15px;text-decoration:none;${
          action.primary
            ? "background:#A82449;color:#ffffff;"
            : "background:#ffffff;color:#A82449;border:1px solid #E8C1C8;"
        }">${escapeHtml(action.label)}</a>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:24px;background:#FDF6F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F1216;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E8C1C8;border-radius:20px;padding:28px;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#A82449;">Vezriqen AI&trade;</p>
    <p style="margin:16px 0 0;font-size:15px;color:#76545D;">${escapeHtml(input.greeting)}</p>
    <h1 style="margin:8px 0 0;font-size:20px;line-height:1.35;color:#1F1216;">${escapeHtml(input.heading)}</h1>
    <p style="margin:6px 0 0;font-size:14px;color:#8E7078;">${escapeHtml(input.goalTitle)}</p>
    ${input.body.map((line) => `<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#76545D;">${escapeHtml(line)}</p>`).join("")}
    <div style="margin:22px 0 0;">${buttons}</div>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8E7078;">${escapeHtml(input.footer)}</p>
  </div>
</body></html>`;
}
