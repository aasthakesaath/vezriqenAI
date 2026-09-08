"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL, SUPABASE_CONFIGURED } from "@/lib/env";
import { safeNextDestination } from "./next-destination";

/**
 * Email sign-in and sign-up, ported from Calyqen (`src/lib/auth/actions.ts`)
 * rather than rewritten — owner decision, 2026-09-08.
 *
 * Supabase brokers both this and the Google button, so the two share one
 * session and there is no second auth system to keep in step. PRD §30.7
 * explicitly permits email sign-up alongside Continue with Google.
 */

/** Where a completed password reset lands. */
const DEFAULT_AFTER_RESET = "/today";

export type AuthState = {
  error?: string;
  message?: string;
  /**
   * The address the mail actually went to, echoed back so a typo is visible.
   * People mistype their own email and then wait for a message that was never
   * going to arrive — seeing it spelled out is how they catch it.
   */
  email?: string;
};

function notConfigured(): AuthState {
  return { error: "Vezriqen isn't configured in this environment yet." };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!SUPABASE_CONFIGURED) return notConfigured();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // DELIBERATE — inherited from Calyqen, and it stays vague here for the
    // same class of reason.
    //
    // A message that distinguishes "no such account" from "wrong password" is
    // an account-enumeration oracle: anyone can type an address and learn
    // whether it is registered. Vezriqen holds uploaded plan documents, goals
    // and execution history — confirming that a given person has an account
    // here is itself a disclosure, and the sign-in form must not be what makes
    // it. One message for both causes, on purpose.
    //
    // Anyone tempted to "improve" this into a helpful "we don't have an
    // account with that email" is removing a privacy control.
    return { error: "That email and password combination didn't work." };
  }

  redirect(safeNextDestination(formData.get("next") as string | null));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!SUPABASE_CONFIGURED) return notConfigured();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and a password." };
  }
  if (password.length < 8) {
    return { error: "Your password needs at least 8 characters." };
  }

  const supabase = await createClient();
  // Where they should land once the account exists. On the confirmation path
  // there is no session to redirect, so the destination has to ride the
  // emailed link or it is lost between the form and the inbox.
  const destination = safeNextDestination(formData.get("next") as string | null);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/api/auth/google/callback?next=${encodeURIComponent(destination)}`,
      data: name ? { full_name: name } : undefined,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Email confirmation enabled: no session until the user clicks the link.
  if (!data.session) {
    return {
      message:
        "Almost there — check your email and click the confirmation link to finish creating your account. We sent it to:",
      email,
    };
  }

  redirect(destination);
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!SUPABASE_CONFIGURED) return notConfigured();

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Please enter your email address." };

  const supabase = await createClient();
  // Route through the callback so the PKCE code is exchanged for a session
  // before the update-password page loads — otherwise the link reads expired.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/api/auth/google/callback?next=${encodeURIComponent("/reset-password/update")}`,
  });

  // Always confirm — never reveal whether an account exists. Echoing the
  // address back says nothing about whether it has an account; it only lets
  // the sender check they typed their own address correctly.
  return {
    message: "If an account exists for that email, a reset link is on its way to:",
    email,
  };
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!SUPABASE_CONFIGURED) return notConfigured();

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Your password needs at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Could not update your password. The link may have expired." };
  }

  redirect(DEFAULT_AFTER_RESET);
}
