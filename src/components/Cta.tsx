import Image from "next/image";
import Link from "next/link";
import { CTA_PRIMARY, CTA_SUPPORT, CTA_SUPPORT_SHORT, FINAL_CTA_HOME, ROUTES } from "@/lib/site";

export function SignUpButton({ className = "" }: { className?: string }) {
  return (
    <Link href={ROUTES.signUp} className={`btn-primary ${className}`}>
      {CTA_PRIMARY}
      <span aria-hidden="true">&rarr;</span>
    </Link>
  );
}

export function CtaSupport({
  className = "",
  short = false,
}: {
  className?: string;
  /** The closing band uses the two-clause form (see CTA_SUPPORT_SHORT). */
  short?: boolean;
}) {
  return (
    <p className={`text-sm text-mauve-light ${className}`}>
      {short ? CTA_SUPPORT_SHORT : CTA_SUPPORT}
    </p>
  );
}

/**
 * Final conversion band. Homepage and My Story use the same component with
 * different headings so the two pages stay visually consistent (PRD §30.5/§30.6).
 */
export function FinalCta({
  heading,
  support,
  withMascot = false,
  shortSupport = false,
}: {
  heading: string;
  support: string;
  withMascot?: boolean;
  shortSupport?: boolean;
}) {
  return (
    <section className="shell pb-20 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-blush-wash to-cream-light px-6 py-14 text-center ring-1 ring-blush/70 sm:px-12">
        {withMascot && (
          <Image
            src="/brand/vezri.webp"
            alt=""
            width={340}
            height={352}
            className="pointer-events-none absolute -bottom-6 left-2 hidden w-40 opacity-95 lg:block"
          />
        )}
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {heading}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-mauve">{support}</p>
        <SignUpButton className="mt-7" />
        <CtaSupport className="mt-4" short={shortSupport} />
      </div>
    </section>
  );
}

export function FinalCtaHome() {
  return (
    <FinalCta
      heading={FINAL_CTA_HOME.heading}
      support={FINAL_CTA_HOME.support}
      withMascot
      shortSupport
    />
  );
}
