import type { Metadata } from "next";
import Link from "next/link";
import FeedbackForm from "@/components/FeedbackForm";
import { BRAND, ROUTES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Feedback",
  description: `Tell the ${BRAND} team what is working, what is not, and what you wish Vezri could do.`,
};

export default function FeedbackPage() {
  return (
    <div className="shell max-w-2xl py-12 lg:py-16">
      <Link
        href={ROUTES.home}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-berry hover:text-berry-deep"
      >
        <span aria-hidden="true">&larr;</span> Back to home
      </Link>

      <h1 className="mt-6 text-4xl font-bold tracking-tight text-ink">Feedback</h1>
      <p className="mt-4 text-lg leading-relaxed text-mauve">
        Tell us what is working, what is not, and what you wish Vezri could do. Every message is read
        by the {BRAND} team.
      </p>

      <FeedbackForm />
    </div>
  );
}
