"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/auth/actions";

const field =
  "mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink placeholder:text-mauve-light/70 focus:border-berry";

/**
 * Email sign-in and sign-up (PRD §30.7 — "Existing email/password sign-up may
 * remain if already supported by the reused auth module").
 *
 * The actions behind this are ported from Calyqen, including its deliberately
 * vague sign-in error. Google stays the prominent option above; this is the
 * alternative for people who would rather not use it.
 */
export default function EmailAuthForm({
  mode,
  next,
}: {
  mode: "signin" | "signup";
  next?: string;
}) {
  const isSignUp = mode === "signup";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    isSignUp ? signUp : signIn,
    {},
  );

  // Sign-up with email confirmation on: there is no session yet, so the only
  // useful thing to show is where the mail went.
  if (state.message) {
    return (
      <div
        role="status"
        className="mt-6 w-full rounded-xl bg-blush-wash px-5 py-4 text-left text-sm leading-relaxed text-ink"
      >
        <p>{state.message}</p>
        {state.email && <p className="mt-1 font-semibold break-all">{state.email}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 w-full text-left">
      {next && <input type="hidden" name="next" value={next} />}

      {isSignUp && (
        <div className="mb-4">
          <label htmlFor="auth-name" className="text-sm font-semibold text-ink">
            Your name <span className="font-normal text-mauve-light">(optional)</span>
          </label>
          <input id="auth-name" name="name" type="text" autoComplete="name" className={field} />
        </div>
      )}

      <div>
        <label htmlFor="auth-email" className="text-sm font-semibold text-ink">
          Email
        </label>
        <input
          id="auth-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={field}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="auth-password" className="text-sm font-semibold text-ink">
          Password
        </label>
        <input
          id="auth-password"
          name="password"
          type="password"
          required
          minLength={isSignUp ? 8 : undefined}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className={field}
        />
        {isSignUp && (
          <p className="mt-1.5 text-sm text-mauve-light">At least 8 characters.</p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary mt-5 w-full disabled:opacity-60">
        {pending ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
      </button>

      {!isSignUp && (
        <p className="mt-3 text-center text-sm">
          <Link href="/reset-password" className="text-mauve hover:text-berry hover:underline">
            Forgot your password?
          </Link>
        </p>
      )}
    </form>
  );
}
