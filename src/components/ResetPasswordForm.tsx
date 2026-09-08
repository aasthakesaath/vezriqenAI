"use client";

import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type AuthState } from "@/lib/auth/actions";

const field =
  "mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink placeholder:text-mauve-light/70 focus:border-berry";

/**
 * Password reset, ported from Calyqen along with its most important property:
 * the request step always reports the same thing whether or not an account
 * exists. Confirming that an address is registered here would be a disclosure
 * in itself.
 */
export function RequestResetForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.message) {
    return (
      <div role="status" className="mt-6 rounded-xl bg-blush-wash px-5 py-4 text-sm leading-relaxed text-ink">
        <p>{state.message}</p>
        {state.email && <p className="mt-1 font-semibold break-all">{state.email}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 text-left">
      <label htmlFor="reset-email" className="text-sm font-semibold text-ink">
        Email
      </label>
      <input
        id="reset-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className={field}
      />
      {state.error && (
        <p role="alert" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary mt-5 w-full disabled:opacity-60">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updatePassword, {});

  return (
    <form action={formAction} className="mt-6 text-left">
      <label htmlFor="new-password" className="text-sm font-semibold text-ink">
        New password
      </label>
      <input
        id="new-password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className={field}
      />
      <p className="mt-1.5 text-sm text-mauve-light">At least 8 characters.</p>
      {state.error && (
        <p role="alert" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary mt-5 w-full disabled:opacity-60">
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
