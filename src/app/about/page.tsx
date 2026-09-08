import type { Metadata } from "next";
import Image from "next/image";
import { FinalCta } from "@/components/Cta";
import {
  BRAND,
  FOUNDER,
  FOUNDER_PORTRAIT_SRC,
  MY_STORY_LABEL,
  MY_STORY_PARAGRAPHS,
  MY_STORY_PARAGRAPHS_AFTER,
  MY_STORY_PULLQUOTE,
} from "@/lib/site";

export const metadata: Metadata = {
  title: `${MY_STORY_LABEL} \u2014 Why I Built ${BRAND}`,
  description: `Why ${FOUNDER.name} built ${BRAND}: a real student, a real problem, and a bigger purpose.`,
};

const PILLARS = [
  {
    title: "A Personal Challenge",
    body: "SAT prep taught me that having a plan isn't the hard part \u2014 following it is.",
    icon: <path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0112 8.6a4.4 4.4 0 017.5 2.3c0 5-7.5 9.6-7.5 9.6z" />,
  },
  {
    title: "A Bigger Purpose",
    body: `So I built ${BRAND} to help others turn their plans into progress.`,
    icon: <path d="M5 20V12m7 8V5m7 15v-6" />,
  },
  {
    title: "For Every Dream",
    body: "Whether it's an exam, a healthier you, or a big idea \u2014 your goals matter.",
    icon: (
      <>
        <circle cx="9" cy="8.5" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0111 0M16.5 6.2a3 3 0 010 5.6M17.5 20a5.6 5.6 0 00-2.2-4.4" />
      </>
    ),
  },
  {
    title: "You've Got This",
    body: `And you don't have to do it alone. ${BRAND} is here to help.`,
    icon: <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-blush-wash to-white">
        <div className="shell grid gap-10 pb-12 pt-14 lg:grid-cols-2 lg:items-start lg:gap-14 lg:pt-20">
          <div>
            <p className="eyebrow">A real student. A real problem. A bigger purpose.</p>
            <h1 className="mt-4 text-balance text-[2.5rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              Why I Built <span className="text-berry">{BRAND}</span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-mauve">
              Sometimes a personal challenge can lead to something bigger.
            </p>

            <div className="mt-8 space-y-4 text-[1.05rem] leading-relaxed text-mauve">
              {MY_STORY_PARAGRAPHS.map((p) => (
                <p key={p}>{p}</p>
              ))}

              <blockquote className="rounded-2xl border-l-4 border-berry bg-blush-wash px-5 py-4 font-semibold text-berry">
                {MY_STORY_PULLQUOTE}
              </blockquote>

              {MY_STORY_PARAGRAPHS_AFTER.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>

            <figure className="mt-8 border-t border-blush pt-5">
              <figcaption className="text-base">
                <span className="block font-semibold text-ink">&mdash; {FOUNDER.name}</span>
                <span className="block text-sm text-mauve-light">{FOUNDER.title}</span>
              </figcaption>
            </figure>
          </div>

          <div className="lg:sticky lg:top-28">
            {FOUNDER_PORTRAIT_SRC ? (
              <div>
                <p className="note mb-3 hidden text-right text-xl leading-tight sm:block">
                  Real challenges.
                  <br />
                  Brighter tomorrow. <span aria-hidden="true">&hearts;</span>
                </p>
                <Image
                  src={FOUNDER_PORTRAIT_SRC}
                  alt={`${FOUNDER.name}, ${FOUNDER.title}`}
                  width={880}
                  height={880}
                  priority
                  sizes="(max-width: 1024px) 100vw, 520px"
                  className="w-full rounded-[1.75rem] object-cover shadow-lift"
                />
              </div>
            ) : (
              /* PRD §30.6 forbids a generated founder portrait. Until the approved
                 photo is supplied, show a typographic card instead. */
              <div className="rounded-[1.75rem] bg-gradient-to-br from-blush-light to-cream-light p-10 text-center ring-1 ring-blush">
                <p className="font-script text-3xl leading-snug text-berry">
                  Real challenges.
                  <br />
                  Brighter tomorrow. <span aria-hidden="true">&hearts;</span>
                </p>
                <p className="mt-6 text-lg font-semibold text-ink">{FOUNDER.name}</p>
                <p className="text-sm text-mauve-light">{FOUNDER.title}</p>
              </div>
            )}

            <ul className="mt-8 space-y-5">
              {PILLARS.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush-light text-berry">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {p.icon}
                    </svg>
                  </span>
                  <span>
                    <span className="block font-semibold text-ink">{p.title}</span>
                    <span className="mt-0.5 block text-[0.95rem] leading-relaxed text-mauve">
                      {p.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <FinalCta
        heading="Have a goal ready? Let's make it happen."
        support={`Join ${BRAND} and turn your plans into progress.`}
        withMascot
      />
    </>
  );
}
