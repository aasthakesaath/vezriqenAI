import type { Metadata } from "next";
import { verifyEmailActionToken } from "@/lib/crypto/tokens";
import RedeemConfirm from "@/components/app/RedeemConfirm";

export const metadata: Metadata = { title: "Check in", robots: { index: false } };
export const runtime = "nodejs";

const LABELS = {
  done: "Mark this done",
  snooze: "Snooze this for a day",
  stuck: "Tell Vezri you're stuck",
} as const;

/**
 * Email action landing page (PRD §12).
 *
 * This GET deliberately changes nothing. Mail clients and security scanners
 * prefetch links, so redeeming on GET would let a scanner mark someone's work
 * done before they ever opened the message. The state change happens on the
 * POST behind the button.
 */
export default async function RedeemPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyEmailActionToken(decodeURIComponent(token));

  if (!verified.valid) {
    return (
      <main id="main" className="shell max-w-md py-20 text-center">
        <h1 className="text-2xl font-bold text-ink">
          {verified.reason === "expired" ? "That link has expired" : "That link isn't valid"}
        </h1>
        <p className="mt-3 text-mauve">
          {verified.reason === "expired"
            ? "Links stay active for a couple of days. You can still check in from the app."
            : "Open Vezriqen and check in there instead."}
        </p>
        <a href="/today" className="btn-primary mt-6">
          Open Vezriqen AI&trade;
        </a>
      </main>
    );
  }

  return (
    <main id="main" className="shell max-w-md py-20 text-center">
      <h1 className="text-2xl font-bold text-ink">
        {LABELS[verified.payload.action]}
      </h1>
      <p className="mt-3 text-mauve">One tap and Vezri will record it.</p>
      <RedeemConfirm token={token} action={verified.payload.action} />
    </main>
  );
}
