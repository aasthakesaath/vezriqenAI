import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { BRAND, LEGAL_CONTACT_EMAIL, LEGAL_OWNER, ROUTES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: `The terms that apply when you use ${BRAND}.`,
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms apply when you use ${BRAND}. Using the service means you agree to them.`}
    >
      <section>
        <h2>Your account</h2>
        <p>
          You need an account to use {BRAND}, and you are responsible for activity that happens
          under it. Keep your sign-in method secure and let us know if you think your account has
          been used without your permission. You must be at least 13 years old to create an account.
        </p>
      </section>

      <section>
        <h2>What {BRAND} does &mdash; and what it does not</h2>
        <p>
          {BRAND} helps you follow a plan you bring to it. It reads your plan, proposes a target and
          an execution path, sends reminders, and helps you recover when work slips. It proposes;
          you decide. Major plan changes, new commitments, and calendar writes require your
          confirmation.
        </p>
        <p>
          {BRAND} is not a medical, legal, financial, or mental-health service, and nothing it
          produces is professional advice. It is a productivity tool, and it can be wrong. Review
          what it suggests before you rely on it, especially for deadlines that matter.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of the plans, documents, and notes you give us. You grant {LEGAL_OWNER}{" "}
          a limited licence to store and process that content solely to operate the service for you.
          You are responsible for having the right to upload what you upload, and for not uploading
          content that is unlawful or that infringes someone else&rsquo;s rights.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not attempt to break, overload, or reverse engineer the service.</li>
          <li>Do not use {BRAND} to harass others or to send unsolicited messages.</li>
          <li>Do not upload malware or attempt to access another user&rsquo;s data.</li>
          <li>Do not resell or redistribute the service without written permission.</li>
        </ul>
      </section>

      <section>
        <h2>Google services</h2>
        <p>
          If you connect Google Calendar, your use of that data is also subject to Google&rsquo;s
          terms. {BRAND} only creates and updates the events it creates, and never modifies or
          deletes events created elsewhere.
        </p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          {BRAND} is offered free during Phase 1 and is provided as-is, without warranties. We may
          change, suspend, or discontinue features, and we may update these terms. If a change is
          significant we will give notice in the product before it takes effect.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, {LEGAL_OWNER} is not liable for indirect or consequential
          losses, including missed deadlines, lost opportunities, or lost data arising from your use
          of the service.
        </p>
      </section>

      <section>
        <h2>Ending your use</h2>
        <p>
          You can delete your account at any time. We may suspend or end an account that breaks
          these terms. Sections that by their nature should survive termination will survive it.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Reach us at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> or through{" "}
          <Link href={ROUTES.feedback}>Feedback</Link>. See also our{" "}
          <Link href={ROUTES.privacy}>Privacy Policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
