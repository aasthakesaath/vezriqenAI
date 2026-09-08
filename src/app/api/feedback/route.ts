import { NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email";
import { feedbackInbox, sanitizePagePath, MAX_FEEDBACK_CHARS } from "@/lib/feedback";
import { BRAND, LEGAL_CONTACT_EMAIL } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Feedback, with NO ACCOUNT BEHIND IT — ported from Meriqen's
 * `app/api/feedback/route.ts` rather than rewritten (owner decision).
 *
 * Public by design. PRD §30.8 makes Feedback the support path for the whole
 * site, and a support form that requires the account someone cannot get into
 * is not a support form.
 *
 * NOTHING IS STORED. Not the address, not the message, not an IP. It emails
 * the inbox and that is all.
 *
 * And it never claims delivery it did not achieve. The old implementation
 * returned 503 when no webhook was configured, which was honest; this keeps
 * that property while actually delivering when email is configured.
 */
export async function POST(request: Request) {
  let body: { topic?: unknown; message?: unknown; contact?: unknown; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not read that." }, { status: 400 });
  }

  const message = String(body.message ?? "")
    .trim()
    .slice(0, MAX_FEEDBACK_CHARS);
  const topic = String(body.topic ?? "")
    .trim()
    .slice(0, 80);
  // Optional on purpose. Leaving it blank must still send.
  const contact = String(body.contact ?? "")
    .trim()
    .slice(0, 200);
  // Sanitised here as well as at the link — the API must not trust the client —
  // so an email action token or a goal id can never reach the inbox.
  const page = sanitizePagePath(String(body.page ?? ""));

  if (message.length < 10) {
    return NextResponse.json(
      { error: "Write a sentence or two first — an empty note tells us nothing." },
      { status: 400 },
    );
  }

  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const provider = getEmailProvider();
  const result = await provider.send({
    to: feedbackInbox(),
    subject: `${BRAND} feedback${topic ? ` — ${topic}` : ""}${page ? ` (${page})` : ""}`,
    text: [
      `Topic: ${topic || "not stated"}`,
      `Page: ${page ?? "not recorded"}`,
      `Reply to: ${contact || "not given"}`,
      "",
      message,
    ].join("\n"),
    html: `<p><b>Topic:</b> ${escape(topic || "not stated")}</p>
<p><b>Page:</b> ${escape(page ?? "not recorded")}</p>
<p><b>Reply to:</b> ${escape(contact || "not given")}</p>
<hr>
<p style="white-space:pre-wrap">${escape(message)}</p>`,
  });

  if (!result.sent) {
    // Never claim it arrived. This is the exact sentence the route exists to
    // avoid having to take back.
    console.error("[vezriqen:feedback] not delivered:", result.reason, result.detail);
    return NextResponse.json(
      {
        error: `That didn't send, and I'm not going to pretend it did. Email ${LEGAL_CONTACT_EMAIL} directly and it reaches the same people.`,
      },
      { status: result.reason === "not_configured" ? 503 : 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
