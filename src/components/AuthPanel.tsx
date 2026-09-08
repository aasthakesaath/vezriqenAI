import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { BRAND, CTA_SUPPORT, ROUTES } from "@/lib/site";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import EmailAuthForm from "@/components/EmailAuthForm";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 14 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.2a14.6 14.6 0 010-8.4l-7.8-6.1a23.5 23.5 0 000 20.6z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2.1 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.2-7.9 2.2-6.4 0-11.7-4.5-13.6-10.4l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

export default function AuthPanel({ mode }: { mode: "signin" | "signup" }) {
  const isSignUp = mode === "signup";

  return (
    <div className="shell flex max-w-md flex-col items-center py-14 text-center lg:py-20">
      <Wordmark />

      <h1 className="mt-8 text-3xl font-bold tracking-tight text-ink">
        {isSignUp ? `Start with ${BRAND}` : `Welcome back to ${BRAND}`}
      </h1>
      <p className="mt-3 text-mauve">
        {isSignUp
          ? "Bring the plan you already have. Vezri takes it from there."
          : "Pick up where you and Vezri left off."}
      </p>

      <form action="/api/auth/google/start" method="post" className="mt-8 w-full">
        <input type="hidden" name="mode" value={mode} />
        <button
          type="submit"
          disabled={!SUPABASE_CONFIGURED}
          className="inline-flex w-full items-center justify-center gap-3 rounded-pill border border-blush bg-white px-6 py-3.5 text-base font-semibold text-ink shadow-soft transition-colors hover:bg-blush-wash disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleMark />
          Continue with Google
        </button>
      </form>

      {!SUPABASE_CONFIGURED && (
        <p role="status" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-mauve">
          Google sign-in isn&rsquo;t configured in this environment yet. Set{" "}
          <code className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable it.
        </p>
      )}

      {/* PRD §30.7 keeps Continue with Google prominent; email is the
          alternative beneath it, not a competing primary. */}
      {SUPABASE_CONFIGURED && (
        <>
          <div className="mt-6 flex w-full items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-blush" />
            <span className="text-xs font-medium uppercase tracking-wide text-mauve-light">or</span>
            <span className="h-px flex-1 bg-blush" />
          </div>
          <EmailAuthForm mode={mode} />
        </>
      )}

      {isSignUp && <p className="mt-5 text-sm text-mauve-light">{CTA_SUPPORT}</p>}

      {/* PRD §5 / §30.7 — calendar access is never implied by signing in. */}
      <p className="mt-6 max-w-sm text-sm leading-relaxed text-mauve-light">
        Signing in doesn&rsquo;t give Vezri access to your calendar. Connecting Google Calendar is a
        separate step you can skip.
      </p>

      <p className="mt-8 text-sm text-mauve">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href={ROUTES.signIn} className="font-semibold text-berry hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href={ROUTES.signUp} className="font-semibold text-berry hover:underline">
              Sign up free
            </Link>
          </>
        )}
      </p>

      <p className="mt-6 max-w-sm text-xs leading-relaxed text-mauve-light">
        By continuing you agree to our{" "}
        <Link href={ROUTES.terms} className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href={ROUTES.privacy} className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
