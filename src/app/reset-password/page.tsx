import type { Metadata } from "next";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { RequestResetForm } from "@/components/ResetPasswordForm";
import { ROUTES } from "@/lib/site";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <div className="shell flex max-w-md flex-col items-center py-14 text-center lg:py-20">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-3 text-mauve">
        We&rsquo;ll email you a link to set a new one.
      </p>
      <div className="w-full">
        <RequestResetForm />
      </div>
      <p className="mt-8 text-sm text-mauve">
        <Link href={ROUTES.signIn} className="font-semibold text-berry hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
