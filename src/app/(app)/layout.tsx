import { redirect } from "next/navigation";
import AppHeader from "@/components/app/AppHeader";
import { getUser } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

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

  return (
    <>
      <AppHeader name={name} />
      <main id="main">{children}</main>
    </>
  );
}
