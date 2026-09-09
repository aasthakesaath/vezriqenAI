import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { BRAND, LEGAL_CONTACT_EMAIL, LEGAL_OWNER, ROUTES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${BRAND} collects, uses, and protects your plans, execution history, and optional Google Calendar data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`${BRAND} exists to help you follow through on your own plans. This policy explains what we collect, why we collect it, and the control you keep over it.`}
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account information.</strong> When you sign in with Google we receive your name,
            email address, and profile image so we can create and secure your account.
          </li>
          <li>
            <strong>Plans you give us.</strong> Documents you upload (PDF, Word, text, Markdown, or
            image) and plan text you paste, together with the goals, milestones, tasks, deadlines,
            and constraints extracted from them.
          </li>
          <li>
            <strong>Execution history.</strong> Your responses to reminders and checkpoints &mdash;
            done, not done, stuck, or waiting on someone &mdash; and the notes you
            add when something gets in the way.
          </li>
          <li>
            <strong>Google Calendar data, only if you connect it.</strong> Event times and
            busy/free information used to plan around your real schedule, plus the events {BRAND}{" "}
            itself creates.
          </li>
          <li>
            <strong>Product and technical data.</strong> Basic usage events, device and browser
            information, and error logs used to keep the service working.
          </li>
        </ul>
      </section>

      <section>
        <h2>Google sign-in and Google Calendar are separate</h2>
        <p>
          Signing in with Google does not grant calendar access. Calendar permission is a separate,
          optional consent step you can decline and still use {BRAND}. We request the minimum scopes
          needed to read your availability and to create and update the events {BRAND} creates.
        </p>
        <p>
          {BRAND} never edits or deletes calendar events it did not create. You can disconnect your
          calendar at any time from your account settings; disconnecting revokes our access token
          and stops all future calendar reads and writes.
        </p>
      </section>

      <section>
        <h2>How we use your information</h2>
        <ul>
          <li>To understand your plan and turn it into a confirmable goal and execution path.</li>
          <li>To schedule reminders and checkpoints, and to send them in-app and by email.</li>
          <li>To help you get unstuck and to adapt your plan when work slips.</li>
          <li>To assess goal health and surface what your plan may be missing.</li>
          <li>To secure the service, prevent abuse, and diagnose faults.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use your uploaded documents or
          plan content to train publicly available models.
        </p>
      </section>

      <section>
        <h2>AI processing</h2>
        <p>
          {BRAND} uses third-party AI providers to read your plans and produce structured goal data.
          Content sent to these providers is limited to what is needed for that task and is handled
          under agreements that prohibit using your content to train their general models. AI output
          is validated before it changes anything in your account, and major plan changes, new
          commitments, and calendar writes always require your confirmation.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          We keep your plans and execution history for as long as your account is active. You can
          delete an uploaded document and the content derived from it at any time, and you can
          delete your account, which removes your plans, goals, execution history, and stored
          tokens. Backups are purged on a rolling schedule.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <ul>
          <li>Access and refresh tokens are encrypted at rest and are never exposed to the browser.</li>
          <li>Uploads are type-checked and size-limited.</li>
          <li>Email action links are short-lived and signed.</li>
          <li>Changes to your plan are logged so you can see what happened and why.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Connect or disconnect Google Calendar at any time.</li>
          <li>Set reminder intensity and quiet hours.</li>
          <li>Request a copy of your data, or ask us to correct or delete it.</li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          {BRAND} is not directed to children under 13. If you believe a child has provided us with
          personal information, contact us and we will delete it.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions or requests can go to{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> or through{" "}
          <Link href={ROUTES.feedback}>Feedback</Link>. This service is operated by {LEGAL_OWNER}.
        </p>
      </section>
    </LegalPage>
  );
}
