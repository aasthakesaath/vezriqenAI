import Image from "next/image";
import Link from "next/link";
import { CtaSupport, FinalCtaHome, SignUpButton } from "@/components/Cta";
import {
  BRAND,
  HERO,
  HOW_IT_WORKS,
  HOW_IT_WORKS_TITLE,
  MASCOT,
  PERSONALIZATION,
  ROUTES,
  STORY_TEASER,
  THINKS_AHEAD,
  THINKS_AHEAD_HEADING,
  USP,
} from "@/lib/site";

/**
 * The public homepage.
 *
 * It answers five questions in order, and nothing else: what is this, why is
 * it different, how does it help, is it easy, what do I do now. The section
 * that carries the most weight is "More Than Reminders" — a visitor who
 * already owns a planner, a habit tracker and a calendar needs to see in one
 * glance that this does the thing none of those do, which is help when the
 * plan stops being followed.
 *
 * Copy lives in lib/site.ts so the tests assert against one source rather than
 * a second transcription that can drift.
 */

const ICONS: Record<string, React.ReactNode> = {
  upload: <path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />,
  // Target: the archery motif the mascot already carries.
  matters: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </>
  ),
  unstuck: (
    <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v8a1.5 1.5 0 01-1.5 1.5H10l-4.2 3.6a.6.6 0 01-1-.46V15H5.5A1.5 1.5 0 014 13.5z" />
  ),
  // A path that bends and carries on — adjusting without losing the goal.
  adjust: (
    <>
      <path d="M3 18h4.5a4.5 4.5 0 004.5-4.5v-3A4.5 4.5 0 0116.5 6H21" />
      <path d="M17.5 3L21 6l-3.5 3" />
    </>
  ),
};

function CardIcon({ id }: { id: string }) {
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blush-light text-berry">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[id]}
      </svg>
    </span>
  );
}

/** One column of the §3 comparison. Ordered, because these are sequences. */
function FlowColumn({
  label,
  steps,
  emphasis,
}: {
  label: string;
  steps: readonly string[];
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-2xl border-2 border-berry/25 bg-white p-4 shadow-soft sm:p-6"
          : "rounded-2xl border border-blush/70 bg-white/60 p-4 sm:p-6"
      }
    >
      {/* Not uppercased: one of these labels is the product name, and §30.13
          requires it to render exactly as "Vezriqen AI™". A text-transform
          that mangles the brand on one column is not worth having on either. */}
      <h3
        className={`text-[0.82rem] font-semibold tracking-wide sm:text-sm ${
          emphasis ? "text-berry" : "text-mauve-light"
        }`}
      >
        {label}
      </h3>
      <ol className="mt-4 space-y-2.5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className={`w-3 shrink-0 pt-px text-sm ${
                emphasis ? "text-berry" : "text-mauve-light"
              }`}
            >
              {i === 0 ? "" : "→"}
            </span>
            <span
              className={`text-[0.9rem] leading-snug sm:text-[0.98rem] ${
                emphasis ? "font-medium text-ink" : "text-mauve"
              }`}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* ------------------------------------------------------------ §1 Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blush-wash via-white to-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-6rem] top-[-4rem] hidden h-[34rem] w-[34rem] rounded-full bg-blush/25 blur-2xl lg:block"
        />
        <div className="shell grid items-center gap-10 pb-14 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-20 lg:pt-20">
          <div className="relative z-10 text-center lg:text-left">
            <p className="eyebrow uppercase tracking-[0.14em]">{HERO.eyebrow}</p>
            <h1 className="mt-4 text-balance text-[2.6rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-6xl">
              {HERO.headingLead}
              <br />
              <span className="text-berry">{HERO.headingTurn}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-mauve lg:mx-0">
              {HERO.support}
            </p>
            <SignUpButton className="mt-8 px-9 py-4 text-lg" />
            <CtaSupport className="mt-4" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-md lg:max-w-none">
            {/* Subtle target/summit motif; the mascot stays the focal visual. */}
            <svg
              viewBox="0 0 400 300"
              aria-hidden="true"
              className="absolute inset-x-0 bottom-6 w-full text-blush"
            >
              <circle cx="278" cy="86" r="62" fill="currentColor" opacity=".28" />
              <circle cx="278" cy="86" r="40" fill="#F5E8D7" opacity=".5" />
              <path d="M0 268l86-92 58 60 74-96 96 128z" fill="currentColor" opacity=".35" />
              <path d="M132 300l88-118 96 118z" fill="#C98F9D" opacity=".22" />
            </svg>
            <Image
              src="/brand/vezri.webp"
              alt={`${MASCOT}, the ${BRAND} falcon archer, drawing a bow at a target`}
              width={1138}
              height={1179}
              priority
              sizes="(max-width: 1024px) 62vw, 460px"
              className="relative mx-auto w-[62%] max-w-[440px] drop-shadow-[0_24px_40px_rgba(118,84,93,0.22)] sm:w-[52%] lg:w-full"
            />
            <p className="note absolute right-0 top-2 hidden text-lg leading-tight lg:block">
              Small steps.
              <br />
              Big wins. <span aria-hidden="true">&hearts;</span>
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------ §2 How Vezri Keeps You Moving */}
      <section id="how-it-works" className="shell scroll-mt-24 py-14 lg:py-20">
        <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {HOW_IT_WORKS_TITLE}
        </h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((card) => (
            <li
              key={card.id}
              className="rounded-2xl border border-blush/60 bg-white p-6 text-center shadow-soft sm:text-left"
            >
              <CardIcon id={card.id} />
              <h3 className="mt-5 text-lg font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-mauve">{card.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------- §3 More Than Reminders */}
      <section aria-labelledby="usp-heading" className="bg-cream-light py-14 lg:py-20">
        <div className="shell">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="usp-heading"
              className="text-balance text-3xl font-bold tracking-tight text-ink sm:text-[2.75rem]"
            >
              {USP.heading}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-mauve">
              {USP.subheadLead}
              <br className="hidden sm:block" />{" "}
              <span className="font-semibold text-ink">{USP.subheadTurn}</span>
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl items-center gap-8 lg:mt-14 lg:grid-cols-[1fr_0.72fr] lg:gap-8">
            {/* Two columns, side by side at every width. Stacking them would
                destroy the comparison, which only reads as a pair.
                items-start, not stretch: our column is taller because it does
                more, and evening the boxes up would hide the one difference
                the section exists to show. */}
            <div className="grid grid-cols-2 items-start gap-3 sm:gap-5">
              <FlowColumn label={USP.ordinary.label} steps={USP.ordinary.steps} />
              <FlowColumn label={USP.ours.label} steps={USP.ours.steps} emphasis />
            </div>

            {/* Vezri, saying the thing the columns imply. */}
            <figure className="m-0 flex items-center justify-center gap-3 sm:gap-5 lg:justify-start">
              <Image
                src="/brand/vezri.webp"
                alt=""
                width={340}
                height={352}
                sizes="(max-width: 640px) 96px, 140px"
                className="w-24 shrink-0 select-none sm:w-28 lg:w-32"
              />
              <figcaption className="relative max-w-[15rem] rounded-2xl rounded-bl-sm bg-white px-5 py-4 text-[0.95rem] leading-relaxed text-ink shadow-soft ring-1 ring-blush/70">
                <span
                  aria-hidden="true"
                  className="absolute -left-1.5 bottom-4 h-3 w-3 rotate-45 bg-white ring-1 ring-blush/70"
                />
                <span className="relative">&ldquo;{USP.quote}&rdquo;</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- §4 Vezri Thinks Ahead */}
      <section aria-labelledby="ahead-heading" className="shell py-14 lg:py-20">
        <h2
          id="ahead-heading"
          className="text-balance text-center text-3xl font-bold tracking-tight text-ink sm:text-4xl"
        >
          {THINKS_AHEAD_HEADING}
        </h2>
        <ul className="mx-auto mt-10 grid max-w-4xl gap-4 sm:gap-5">
          {THINKS_AHEAD.map((row) => (
            <li
              key={row.trigger}
              className="rounded-2xl border border-blush/60 bg-white p-5 shadow-soft sm:p-6"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[1.02rem] font-medium text-mauve">{row.trigger}</span>
                <span aria-hidden="true" className="text-berry">
                  &rarr;
                </span>
                <span className="rounded-pill bg-blush-light px-3.5 py-1 text-[1.02rem] font-semibold text-berry">
                  {row.move}
                </span>
              </div>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-mauve-light">{row.why}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------- §5 Personalization */}
      <section aria-labelledby="personal-heading" className="bg-blush-wash py-14 lg:py-20">
        <div className="shell grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
          <div className="text-center lg:text-left">
            <h2
              id="personal-heading"
              className="text-balance text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl"
            >
              {PERSONALIZATION.headingLead}
              <br />
              <span className="text-berry">{PERSONALIZATION.headingTurn}</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-mauve lg:mx-0">
              {PERSONALIZATION.support}
            </p>
          </div>

          <ul className="grid gap-3.5">
            {PERSONALIZATION.rows.map((row) => (
              <li
                key={row.observation}
                className="flex flex-col gap-1.5 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-blush/60 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="text-[0.98rem] leading-snug text-mauve sm:flex-1">
                  {row.observation}
                </span>
                <span aria-hidden="true" className="hidden text-berry sm:block">
                  &rarr;
                </span>
                <span className="text-[0.98rem] font-semibold leading-snug text-ink sm:flex-1">
                  {row.response}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ §6 My Story teaser */}
      <section aria-labelledby="story-heading" className="shell py-14 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="story-heading"
            className="text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          >
            {STORY_TEASER.heading}
          </h2>
          {STORY_TEASER.lines.map((line, i) => (
            <p
              key={line}
              className={`mx-auto max-w-lg text-lg leading-relaxed text-mauve ${
                i === 0 ? "mt-5" : "mt-1"
              }`}
            >
              {line}
            </p>
          ))}
          <Link href={ROUTES.about} className="btn-secondary mt-7">
            {STORY_TEASER.cta}
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------------- §7 Final CTA */}
      <FinalCtaHome />
    </>
  );
}
