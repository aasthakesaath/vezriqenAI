import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/site";
import { APP_ROUTES } from "@/lib/routes";

/**
 * Chrome for the signed-in product. Quieter than the marketing header — no
 * conversion CTAs — but still branded Vezriqen AI™ everywhere (PRD §30.7).
 */
export default function AppHeader({ name }: { name?: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-blush/50 bg-white/90 backdrop-blur">
      <div className="shell flex h-[4.5rem] items-center justify-between gap-4">
        <Link href={APP_ROUTES.today} className="flex items-center gap-2.5" aria-label={`${BRAND} home`}>
          <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-blush-wash ring-1 ring-blush">
            <Image
              src="/brand/vezri.webp"
              alt=""
              width={72}
              height={72}
              className="h-full w-full scale-[2.6] object-cover object-[38%_18%]"
            />
          </span>
          <span className="block text-[1.35rem] font-bold tracking-tight text-berry">{BRAND}</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-5">
          <Link
            href={APP_ROUTES.today}
            className="text-[0.95rem] font-medium text-mauve transition-colors hover:text-berry"
          >
            Today
          </Link>
          <Link
            href={APP_ROUTES.settings}
            className="text-[0.95rem] font-medium text-mauve transition-colors hover:text-berry"
          >
            Settings
          </Link>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
      {name ? <span className="sr-only">Signed in as {name}</span> : null}
    </header>
  );
}
