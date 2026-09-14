import type { Metadata } from "next";
import Image from "next/image";
import { FinalCta } from "@/components/Cta";
import {
  BRAND,
  FINAL_CTA_STORY,
  FOUNDER,
  MY_STORY_EYEBROW,
  MY_STORY_LABEL,
  MY_STORY_PARAGRAPHS,
  MY_STORY_PARAGRAPHS_AFTER,
  MY_STORY_PARAGRAPHS_OUTWARD,
  MY_STORY_PILLARS,
  MY_STORY_PULLQUOTE,
  MY_STORY_SUBHEAD,
  MY_STORY_VEZRI,
  STORY_IMAGE_ALT,
  STORY_IMAGE_NOTE,
  STORY_IMAGE_SRC,
} from "@/lib/site";

export const metadata: Metadata = {
  title: `${MY_STORY_LABEL} — Why I Built ${BRAND}`,
  description: `Why ${FOUNDER.name} built ${BRAND}: an SAT study plan, a week that never went to plan, and what came out of it.`,
};

/** The artwork's real dimensions. next/image needs them to reserve the space. */
const HERO_WIDTH = 1448;
const HERO_HEIGHT = 1086;

/**
 * One icon per pillar, keyed by the id in MY_STORY_PILLARS — the same split the
 * homepage uses, so the copy stays in lib/site.ts and only the drawing lives
 * here. Each icon answers its card's moment: a target for the next step, a
 * speech bubble for the day that got missed, a path that bends for the week
 * that changed, two figures for the thing that needs somebody else.
 */
const PILLAR_ICONS: Record<string, React.ReactNode> = {
  next: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </>
  ),
  missed: (
    <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v8a1.5 1.5 0 01-1.5 1.5H10l-4.2 3.6a.6.6 0 01-1-.46V15H5.5A1.5 1.5 0 014 13.5z" />
  ),
  week: (
    <>
      <path d="M3 18h4.5a4.5 4.5 0 004.5-4.5v-3A4.5 4.5 0 0116.5 6H21" />
      <path d="M17.5 3L21 6l-3.5 3" />
    </>
  ),
  waiting: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0111 0M16.5 6.2a3 3 0 010 5.6M17.5 20a5.6 5.6 0 00-2.2-4.4" />
    </>
  ),
};

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
          {STORY_IMAGE_NOTE} <span aria-hidden="true">&hearts;</span>
        </figcaption>
      </div>
    </figure>
  );
}

/** PRD §30.6 heading block. */
function StoryHeading() {
  return (
    <>
      <p className="eyebrow">{MY_STORY_EYEBROW}</p>
      <h1 className="mt-4 text-balance text-[2.5rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl">
        Why I Built <span className="text-berry">{BRAND}</span>
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-mauve">{MY_STORY_SUBHEAD}</p>
    </>
  );
}

/** Shared by both halves of the narrative, so the two read as one column. */
const PROSE = "space-y-4 text-[1.05rem] leading-relaxed text-mauve";

/**
 * The story, §30.6 — up to and including the line it ends on.
 *
 * It stops at "So I built Vezriqen AI™" because that is where the page hands
 * over: the Vezri block comes next and turns outward, and StoryOutward picks
 * up after it in the second person. Splitting the narrative in two is what
 * makes that order structural rather than a thing to remember.
 */
function StoryOrigin() {
  return (
    <div className={`mt-8 ${PROSE}`}>
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
  );
}

/**
 * Meet Vezri. Mascot beside the text on desktop, mascot above it on a phone —
 * `flex-col` until `sm:flex-row`, so the stack order is the source order and
 * no `order-` class has to hold it.
 *
 * Why this block is wider than the prose it interrupts: the reading column is
 * `max-w-prose`, 65ch, and putting a 144px drawing beside 65ch leaves about 41
 * characters a line — under the 45 that the comment on AboutPage sets as the
 * floor. `max-w-3xl` is the width the pillars below already use, so the block
 * lines up with something rather than inventing a width of its own.
 *
 * Type and spacing are the page's: the body is the same `text-[1.05rem]` as
 * the story around it, and the heading is `text-xl`, which the hero caption
 * already uses. Nothing new is introduced for one block.
 */
function VezriBlock({ className = "" }: { className?: string }) {
  return (
    <section aria-labelledby="meet-vezri" className={className}>
      <div className="flex flex-col items-center gap-5 rounded-[1.75rem] bg-blush-wash px-6 py-8 ring-1 ring-blush/70 sm:flex-row sm:gap-8 sm:px-8">
        <Image
          src={MY_STORY_VEZRI.imageSrc}
          alt={MY_STORY_VEZRI.imageAlt}
          width={MY_STORY_VEZRI.imageWidth}
          height={MY_STORY_VEZRI.imageHeight}
          sizes="(max-width: 640px) 40vw, 144px"
          className="w-36 shrink-0 select-none"
        />
        <div>
          <h2 id="meet-vezri" className="text-xl font-semibold text-ink">
            {MY_STORY_VEZRI.heading}
          </h2>
          <div className={`mt-3 ${PROSE}`}>
            {MY_STORY_VEZRI.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The rest of the page, in the reader's direction. Signed, because the story above was mine. */
function StoryOutward() {
  return (
    <>
      <div className={PROSE}>
        {MY_STORY_PARAGRAPHS_OUTWARD.map((p) => (
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
      {MY_STORY_PILLARS.map((p) => (
        <li key={p.id} className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush-light text-berry">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {PILLAR_ICONS[p.id]}
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
 * The order below is the argument, not a layout: story, then Vezri, then the
 * reader. The page is first person down to "So I built Vezriqen AI™", turns at
 * the Vezri block, and everything after it — prose, pillars, closing CTA —
 * addresses the reader and stays there.
 *
 * Two containers are wider than the reading column, and for the same reason:
 * the Vezri block is prose with a drawing beside it, and the pillars are a
 * two-up grid of short lines. 65ch would squeeze either into one cramped
 * column on a laptop.
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
            <StoryOrigin />
          </div>

          <VezriBlock className="mx-auto mt-10 max-w-3xl" />

          <div className="mx-auto mt-10 max-w-prose">
            <StoryOutward />
          </div>

          <Pillars className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2" />
        </div>
      </section>

      <FinalCta heading={FINAL_CTA_STORY.heading} support={FINAL_CTA_STORY.support} withMascot />
    </>
  );
}
