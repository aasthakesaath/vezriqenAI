import { redirect } from "next/navigation";
import AppHeader from "@/components/app/AppHeader";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadBellReminders } from "@/lib/reminders/bell";
import { SUPABASE_CONFIGURED } from "@/lib/env";

/**
 * Every page below this layout is per-user, so none of them may be statically
 * prerendered — there is no build-time "everyone" to render for. Declaring it
 * here rather than page by page means a new authenticated route cannot forget.
 */
export const dynamic = "force-dynamic";

/**
 * Shell for every signed-in route.
 *
 * The middleware already bounces anonymous requests; this second check is the
 * one that actually protects data, because middleware can be bypassed by
 * direct invocation in some deployment topologies. Cheap, and it means no page
 * below this layout has to think about auth.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!SUPABASE_CONFIGURED) {
    return (
      <main id="main" className="shell max-w-lg py-20">
        <h1 className="text-2xl font-bold text-ink">Not configured yet</h1>
        <p className="mt-3 text-mauve">
          Vezriqen needs <code className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to sign you in.
        </p>
      </main>
    );
  }

  const user = await getUser();
  if (!user) redirect("/signin");

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    null;

  const supabase = await createClient();
  const reminders = await loadBellReminders({ supabase });

  return (
    // The signed-in product sits on the softest tint in the palette so white
    // cards lift off it. blush-wash and not blush-light or cream-light: those
    // two are dark enough that mauve-light and rose fail AA on them, which is
    // measured in tests/palette-contrast.test.ts rather than judged by eye.
    // min-h-screen so the tint reaches the bottom of a short page.
    <div className="min-h-screen bg-blush-wash">
      <AppHeader name={name} reminders={reminders} />
      <main id="main">{children}</main>
    </div>
  );
}
