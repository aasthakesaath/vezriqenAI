import type { Metadata } from "next";
import Wordmark from "@/components/Wordmark";
import { UpdatePasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

/**
 * Reached from the emailed reset link, which routes through the auth callback
 * so the code is exchanged for a session before this page loads. Without that
 * session the update simply fails with "the link may have expired", which is
 * the honest message for every reason it can fail.
 */
export default function UpdatePasswordPage() {
  return (
    <div className="shell flex max-w-md flex-col items-center py-14 text-center lg:py-20">
      <Wordmark />
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-ink">Set a new password</h1>
      <div className="w-full">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
