import type { Metadata } from "next";
import Image from "next/image";
import { FinalCta } from "@/components/Cta";
import {
  BRAND,
  FOUNDER,
  MY_STORY_LABEL,
  MY_STORY_PARAGRAPHS,
  MY_STORY_PARAGRAPHS_AFTER,
  MY_STORY_PULLQUOTE,
  STORY_IMAGE_ALT,
  STORY_IMAGE_SRC,
} from "@/lib/site";

export const metadata: Metadata = {
  title: `${MY_STORY_LABEL} — Why I Built ${BRAND}`,
  description: `Why ${FOUNDER.name} built ${BRAND}: a real student, a real problem, and a bigger purpose.`,
};

/** The artwork's real dimensions. next/image needs them to reserve the space. */
const HERO_WIDTH = 1448;
const HERO_HEIGHT = 1086;

const PILLARS = [
  {
    title: "A Personal Challenge",
    body: "SAT prep taught me that having a plan isn't the hard part — following it is.",
    icon: <path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0112 8.6a4.4 4.4 0 017.5 2.3c0 5-7.5 9.6-7.5 9.6z" />,
  },
  {
    title: "A Bigger Purpose",
    body: `So I built ${BRAND} to help others turn their plans into progress.`,
    icon: <path d="M5 20V12m7 8V5m7 15v-6" />,
  },
  {
    title: "For Every Dream",
    body: "Whether it's an exam, a healthier you, or a big idea — your goals matter.",
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

/**
 * The story artwork, across the top of the page.
 *
 * It is 1448×1086 — 4:3 landscape — and it replaced a square portrait that sat
 * in a sidebar. That is the whole reason this is a hero and not a column: a
 * landscape picture holding two subjects, dropped into a portrait slot, is
 * either letterboxed down to a stripe or cropped straight through a face.
 *
 * Where the crop happens, and where it does not:
 *
 *   under 640px  aspect-[4/3] — the artwork's own ratio, so nothing is cut at
 *                all. On a phone the whole picture is the point; losing the
 *                sunset to make it shorter is not a trade worth making.
 *   640px and up the box widens to 3/2 and then 16/10. A box WIDER than 4:3
 *                overflows vertically, never horizontally, so the crop takes
 *                sky and hem — Nikita on the left and the target on the right
 *                are both fully in frame at every width.
 *
 * `object-left` is still set, and deliberately. It costs nothing while the box
 * stays wide, and it is the safety net for the one change that would otherwise
 * quietly cut the subject in half: someone giving this box a narrow or square
 * ratio later. The default is centre, which would take the crop out of both
 * edges — Nikita's face off one side, the target off the other.
 *
 * How deep the crop may go is set by Vezri, not by taste. Her head is about
 * 13% down the artwork, so the top of the frame is the constraint: 16/10 takes
 * 8.3% off each edge and clears her; 16/9 takes 12.5% and grazes the bow in
 * her hair; 21/9, which this box used before the artwork existed, takes 21.5%
 * and removes her head entirely.
 */
function StoryHero({ src }: { src: string }) {
  return (
    <figure className="mt-10">
      {/* max-w-[1200px]: the shell is already this wide, but the cap is stated
          here so the hero cannot grow if the shell ever does. */}
      <div className="mx-auto max-w-[1200px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.75rem] bg-blush-light shadow-lift sm:aspect-[3/2] lg:aspect-[16/10]">
          <Image
            src={src}
            alt={STORY_IMAGE_ALT}
            width={HERO_WIDTH}
            height={HERO_HEIGHT}
            priority
            // The hero is full-bleed inside the shell up to its 1200px cap, so
            // a phone is told 100vw and asks for a ~375-750px rendition rather
            // than the 1448px original.
            sizes="(max-width: 1200px) 100vw, 1200px"
            className="absolute inset-0 h-full w-full object-cover object-left"
          />
        </div>
        <figcaption className="note mt-4 text-center text-xl leading-tight">
          Real challenges. Brighter tomorrow. <span aria-hidden="true">&hearts;</span>
        </figcaption>
      </div>
    </figure>
  );
}

/** PRD §30.6 heading block. */
function StoryHeading() {
  return (
    <>
      <p className="eyebrow">A real student. A real problem. A bigger purpose.</p>
      <h1 className="mt-4 text-balance text-[2.5rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl">
        Why I Built <span className="text-berry">{BRAND}</span>
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-mauve">
        Sometimes a personal challenge can lead to something bigger.
      </p>
    </>
  );
}

/** The approved narrative and signature, §30.6. */
function StoryProse() {
  return (
    <>
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
    </>
  );
}

function Pillars({ className = "" }: { className?: string }) {
  return (
    <ul className={className}>
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
  );
}

/**
 * My Story (PRD §30.6), built around the wide artwork.
 *
 * One column, hero first. The two-column arrangement that used to be here put
 * the narrative beside a square portrait; with the portrait retired there is
 * nothing left for the text to sit beside, and a lone column of prose running
 * the full width of a 1200px shell is ~110 characters a line. `max-w-prose` is
 * 65ch, which is inside the 45–75 the typographic literature settles on and is
 * why the reading column is narrower than the picture above it.
 *
 * The pillars keep a wider container: they are a two-up grid of short lines,
 * not prose, and 65ch would squeeze them into one column on a laptop.
 */
export default function AboutPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-blush-wash to-white">
        <div className="shell pb-12 pt-14 lg:pt-20">
          <div className="mx-auto max-w-prose">
            <StoryHeading />
          </div>

          <StoryHero src={STORY_IMAGE_SRC} />

          <div className="mx-auto mt-10 max-w-prose">
            <StoryProse />
          </div>

          <Pillars className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2" />
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
