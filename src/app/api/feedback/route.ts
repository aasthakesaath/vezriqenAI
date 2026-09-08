import { NextResponse } from "next/server";
import { LEGAL_CONTACT_EMAIL } from "@/lib/site";

export const runtime = "nodejs";

type Body = { topic?: unknown; email?: unknown; message?: unknown };

const MAX_MESSAGE = 4000;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("We couldn't read that request.");
  }

  const topic = typeof body.topic === "string" ? body.topic.slice(0, 80) : "Something else";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (message.length < 10) return bad("Please write at least a sentence so we know what to look at.");
  if (message.length > MAX_MESSAGE) return bad("That message is too long. Trim it and try again.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email address doesn't look right.");

  const destination = process.env.FEEDBACK_WEBHOOK_URL;

  // No silent drops: if there is nowhere to deliver feedback, say so.
  if (!destination) {
    return bad(
      `Feedback delivery isn't configured yet. Please email ${LEGAL_CONTACT_EMAIL} instead.`,
      503,
    );
  }

  try {
    const res = await fetch(destination, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "Vezriqen AI", topic, email, message, at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Destination responded ${res.status}`);
  } catch (err) {
    console.error("[feedback] delivery failed", err);
    return bad("We couldn't deliver that just now. Please try again shortly.", 502);
  }

  return NextResponse.json({ ok: true });
}
