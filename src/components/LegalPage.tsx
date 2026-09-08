import Link from "next/link";
import { VezriPoseImage } from "@/components/VezriWorking";
import { LEGAL_LAST_UPDATED, ROUTES } from "@/lib/site";

/**
 * Shared shell for /privacy and /terms. Mirrors the clean Calyqen AI legal-page
 * layout and back-navigation pattern described in PRD §30.8 so the two products
 * stay consistent. Wording is Vezriqen-specific and lives in the page files.
 */
export default function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <Link
        href={ROUTES.home}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-berry hover:text-berry-deep"
      >
        <span aria-hidden="true">&larr;</span> Back to home
      </Link>

      <div className="flex items-start justify-between gap-6">
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-ink">{title}</h1>
        <VezriPoseImage pose="reading" alt="" className="h-14 w-auto shrink-0 sm:h-20" />
      </div>
      <p className="mt-2 text-sm text-mauve-light">Last updated {LEGAL_LAST_UPDATED}</p>
      <p className="mt-6 text-lg leading-relaxed text-mauve">{intro}</p>

      <div className="mt-10 space-y-9 text-[1.02rem] leading-relaxed text-mauve [&_a]:font-medium [&_a]:text-berry [&_a:hover]:underline [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:pl-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
