import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import HomePage from "@/app/page";
import AboutPage from "@/app/about/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import FeedbackPage from "@/app/feedback/page";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthPanel from "@/components/AuthPanel";
import VezriWorking from "@/components/VezriWorking";
import ProgressPreview from "@/components/ProgressPreview";
import {
  BRAND,
  CTA_PRIMARY,
  CTA_SUPPORT,
  CTA_SUPPORT_SHORT,
  FINAL_CTA_HOME,
  FINAL_CTA_STORY,
  HERO,
  HOW_IT_WORKS,
  HOW_IT_WORKS_TITLE,
  MASCOT,
  MY_STORY_EYEBROW,
  MY_STORY_LABEL,
  MY_STORY_PARAGRAPHS_OUTWARD,
  MY_STORY_PILLARS,
  MY_STORY_PULLQUOTE,
  MY_STORY_SUBHEAD,
  MY_STORY_VEZRI,
  PERSONALIZATION,
  ROUTES,
  STORY_IMAGE_ALT,
  STORY_IMAGE_NOTE,
  STORY_TEASER,
  THINKS_AHEAD,
  THINKS_AHEAD_HEADING,
  USP,
} from "@/lib/site";
import { UNDERSTANDING_STEPS } from "@/lib/app-copy";

const html = (el: ReactElement) => renderToStaticMarkup(el);

const decode = (s: string) =>
  s.replace(/&trade;/g, "\u2122").replace(/&rsquo;/g, "\u2019").replace(/&amp;/g, "&");

/** renderToStaticMarkup escapes entities; compare on decoded text. */
const text = (el: ReactElement) =>
  html(el)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&trade;/g, "\u2122")
    .replace(/\s+/g, " ");

// HomePage reads searchParams (the post-deletion confirmation), so it is an
// async server component and has to be awaited into an element before it can
// be rendered to markup. No query string: this is the ordinary visit.
const homeElement = await HomePage({ searchParams: Promise.resolve({}) });
const home = html(homeElement);
const homeText = text(homeElement);
const about = html(<AboutPage />);
const aboutText = text(<AboutPage />);
const header = html(<Header />);
const headerText = text(<Header />);
const footer = html(<Footer />);
const footerText = text(<Footer />);

describe("branding (PRD §30.2, §30.13)", () => {
  it("uses the full trademarked product name in the header and footer", () => {
    expect(headerText).toContain(BRAND);
    expect(footerText).toContain(BRAND);
  });

  it("never renders a bare 'Vezriqen' as the product brand", () => {
    for (const markup of [header, footer, home, about]) {
      // Every occurrence of "Vezriqen" must be followed by " AI™".
      const bare = decode(markup).match(/Vezriqen(?!\s*AI\u2122)/g) ?? [];
      expect(bare).toEqual([]);
    }
  });

  it("shows the brand line", () => {
    expect(headerText.toLowerCase()).toContain("aim. adjust. achieve.");
  });

  it("uses the supplied dusty-rose falcon asset, not a substitute bird", () => {
    expect(home).toContain("/brand/vezri.webp");
  });
});

describe("navigation (PRD §30.4, §30.9, §30.13)", () => {
  it("shows How It Works, My Story ♥, Sign In and Sign Up Free", () => {
    expect(headerText).toContain("How It Works");
    expect(headerText).toContain(MY_STORY_LABEL);
    expect(headerText).toContain("Sign In");
    expect(headerText).toContain(CTA_PRIMARY);
  });

  /**
   * Privacy was removed from the top menu by the owner (2026-09-08), which
   * departs from PRD §30.4's listed order. The policy must still be one click
   * from every page, so this asserts the thing that actually matters: it left
   * the header AND it is still in the footer. Dropping it from both would be a
   * legal problem, not a design choice.
   */
  it("keeps Privacy out of the header but reachable from the footer", () => {
    expect(headerText).not.toContain("Privacy");
    expect(footerText).toContain("Privacy");
    expect(footer).toContain(`href="${ROUTES.privacy}"`);
  });

  it("keeps the heart in the My Story label in header and footer", () => {
    expect(MY_STORY_LABEL).toContain("\u2665");
    expect(headerText).toContain("My Story \u2665");
    expect(footerText).toContain("My Story \u2665");
  });

  it("has no Contact, Pricing or standalone Features navigation", () => {
    for (const t of [headerText, footerText]) {
      expect(t).not.toMatch(/\bContact\b/);
      expect(t).not.toMatch(/\bPricing\b/);
      expect(t).not.toMatch(/\bFeatures\b/);
    }
  });

  it("links My Story ♥ to /about and How It Works to the homepage anchor", () => {
    expect(header).toContain(`href="${ROUTES.about}"`);
    expect(header).toContain(`href="/#how-it-works"`);
  });

  it("lists My Story ♥, Privacy, Terms and Feedback in the footer", () => {
    for (const href of [ROUTES.about, ROUTES.privacy, ROUTES.terms, ROUTES.feedback]) {
      expect(footer).toContain(`href="${href}"`);
    }
  });
});

describe("homepage (PRD §30.5, §30.13)", () => {
  it("uses the approved hero copy", () => {
    expect(homeText).toContain(HERO.eyebrow);
    expect(homeText).toContain("Don\u2019t Just Make a Plan.");
    expect(homeText).toContain("Finish It.");
    expect(homeText).toContain(
      "Upload your plan. Vezri helps you follow it, get unstuck, adjust when life happens, and reach the goal.",
    );
  });

  it("puts the accent colour on the second half of the headline", () => {
    // "Finish It." is the differentiator; the emphasis has to land there and
    // not on "Don't Just Make a Plan.", which any planner could say.
    expect(home).toMatch(
      new RegExp(`<span class="text-berry">${HERO.headingTurn.replace(".", "\\.")}</span>`),
    );
  });

  it("carries the how-it-works anchor, its title and all four cards", () => {
    expect(home).toContain('id="how-it-works"');
    expect(homeText).toContain(HOW_IT_WORKS_TITLE);
    for (const card of HOW_IT_WORKS) {
      expect(homeText).toContain(card.title);
      expect(homeText).toContain(card.body);
    }
  });

  it("renders the difference section as a two-column comparison", () => {
    expect(homeText).toContain(USP.heading);
    expect(homeText).toContain(USP.subheadLead);
    expect(homeText).toContain(USP.subheadTurn);

    // Both columns, in full. A visitor who only sees our column learns
    // nothing: the section works by contrast or not at all.
    expect(homeText).toContain(USP.ordinary.label);
    for (const step of USP.ordinary.steps) expect(homeText).toContain(step);
    expect(homeText).toContain(USP.ours.label);
    for (const step of USP.ours.steps) expect(homeText).toContain(step);

    // The three steps that only our column has are the whole argument.
    for (const step of ["Understand what got in the way", "Adjust", "Achieve"]) {
      expect(USP.ours.steps).toContain(step);
      expect(USP.ordinary.steps).not.toContain(step);
    }

    expect(homeText).toContain(USP.quote);
  });

  it("shows all three lead-time examples with the reason for each", () => {
    expect(homeText).toContain(THINKS_AHEAD_HEADING);
    expect(THINKS_AHEAD).toHaveLength(3);
    for (const row of THINKS_AHEAD) {
      expect(homeText).toContain(row.trigger);
      expect(homeText).toContain(row.move);
      // The reason is what separates this from a scheduling trick.
      expect(homeText).toContain(row.why);
    }
  });

  it("shows the personalisation rows without diagnosing the user", () => {
    expect(homeText).toContain(PERSONALIZATION.headingLead);
    expect(homeText).toContain(PERSONALIZATION.headingTurn);
    expect(homeText).toContain(PERSONALIZATION.support);
    for (const row of PERSONALIZATION.rows) {
      expect(homeText).toContain(row.observation);
      expect(homeText).toContain(row.response);
    }
  });

  it("teases My Story and links to the full page rather than repeating it", () => {
    expect(homeText).toContain(STORY_TEASER.heading);
    for (const line of STORY_TEASER.lines) expect(homeText).toContain(line);
    expect(home).toContain(`href="${ROUTES.about}"`);
    // The story itself stays on /about (PRD §30.6).
    expect(homeText).not.toContain(MY_STORY_PULLQUOTE);
    expect(homeText).not.toContain("preparing for the SAT");
  });

  it("closes with the final CTA and its shorter reassurance line", () => {
    expect(homeText).toContain(FINAL_CTA_HOME.heading);
    expect(homeText).toContain(FINAL_CTA_HOME.support);
    expect(homeText).toContain(CTA_SUPPORT_SHORT);
  });

  it("shows Sign Up Free in the hero and the final CTA, with support text", () => {
    const signUpLinks = home.match(new RegExp(`href="${ROUTES.signUp}"`, "g")) ?? [];
    expect(signUpLinks.length).toBeGreaterThanOrEqual(2);
    expect(homeText).toContain(CTA_SUPPORT);
  });

  it("has no competing primary CTA", () => {
    expect(homeText).not.toMatch(/Book a Demo|Learn More|Get Started/);
  });

  it("stays scannable — materially less body copy than a typical SaaS landing page", () => {
    // The page gained three sections in the conversion rewrite and still got
    // shorter: 330 words against the previous build. The cap is that plus
    // ~15% headroom, so it went DOWN from 400 rather than up. Raising it is a
    // decision, not a fix — if a change needs more words, the words are the
    // thing to question first.
    expect(homeText.trim().split(/\s+/).length).toBeLessThan(380);
  });

  it("exposes exactly one h1", () => {
    expect((home.match(/<h1/g) ?? []).length).toBe(1);
  });
});

describe("Vezri working state (shared model-call loading component)", () => {
  const working = html(<VezriWorking stages={UNDERSTANDING_STEPS} />);
  const failed = html(
    <VezriWorking stages={UNDERSTANDING_STEPS} error="Vezri couldn't read that plan." />,
  );

  it("announces itself politely and marks the region busy", () => {
    expect(working).toContain('role="status"');
    expect(working).toContain('aria-live="polite"');
    expect(working).toContain('aria-busy="true"');
  });

  it("shows the stage it was given, in plain language", () => {
    // One stage, because the caller owns progression now — the component has
    // no clock of its own to walk a list with.
    expect(text(<VezriWorking stages={[UNDERSTANDING_STEPS[0]]} />)).toContain(
      UNDERSTANDING_STEPS[0],
    );
    for (const jargon of [
      "extraction",
      "extracting",
      "provenance",
      "schema",
      "parsing",
      "SMART",
      "dependency engine",
      "execution profile",
      "lead-time",
    ]) {
      expect(text(<VezriWorking stages={[UNDERSTANDING_STEPS[0]]} />).toLowerCase()).not.toContain(
        jargon.toLowerCase(),
      );
    }
  });

  it("reports no percentage and renders no progress bar", () => {
    // Honest progress: a single model call has no intermediate events, so
    // there is nothing a bar could truthfully measure. Stage text only.
    //
    // The percentage check is on the visible text, not the markup: the markup
    // legitimately carries percentages in Tailwind position classes.
    expect(text(<VezriWorking stages={UNDERSTANDING_STEPS} />)).not.toMatch(/\d+\s*%/);
    expect(working).not.toContain('role="progressbar"');
    expect(working).not.toContain("aria-valuenow");
  });

  it("uses an approved mascot pose and hides it from screen readers", () => {
    // Which pose belongs to which state is pinned in tests/vezri-poses.test.tsx;
    // here it only matters that the card draws one and that it is decorative,
    // because the stage line in the live region is the accessible message.
    expect(working).toMatch(/vezri-(reading|thinking|confused)\.webp/);
    expect(working).toContain('alt=""');
  });

  it("on failure says so plainly, offers a retry, and stops claiming to be busy", () => {
    expect(failed).toContain('aria-busy="false"');
    expect(failed).toContain('role="alert"');
    expect(text(<VezriWorking stages={UNDERSTANDING_STEPS} error="Vezri couldn't read that plan." />))
      .toContain("Vezri couldn't read that plan.");

    const withRetry = text(
      <VezriWorking stages={UNDERSTANDING_STEPS} error="Nope." onRetry={() => {}} />,
    );
    expect(withRetry).toContain("Try again");
  });
});

describe("the Vezri avatar", () => {
  const preview = html(<ProgressPreview />);

  it("is a real cropped asset everywhere a small circle is drawn", () => {
    // Not the full-body art zoomed with CSS: those offsets only framed the
    // head at one exact box size, and upscaled it out of a downscaled render.
    for (const markup of [header, footer, preview]) {
      expect(markup).toContain("/brand/vezri-avatar.webp");
    }
  });

  it("never re-derives the crop in CSS", () => {
    for (const markup of [header, footer, preview]) {
      expect(markup).not.toMatch(/scale-\[2\.\d/);
      expect(markup).not.toMatch(/object-\[\d+%_\d+%\]/);
    }
  });

  it("stays decorative — the wordmark's own text carries the name", () => {
    expect(header).toContain('alt=""');
    expect(headerText).toContain(BRAND);
  });
});

describe("My Story page (PRD §30.6, §30.13)", () => {
  it("uses the approved eyebrow, headline and subhead", () => {
    expect(aboutText).toContain(MY_STORY_EYEBROW);
    expect(aboutText).toContain(`Why I Built ${BRAND}`);
    expect(aboutText).toContain(MY_STORY_SUBHEAD);
    expect(aboutText).toContain(STORY_IMAGE_NOTE);
  });

  /**
   * The register §30.6 rules out, asserted as a list because every one of these
   * was on this page before the 2026-09-14 copy pass and each is the kind of
   * line that gets added back one at a time without anyone objecting to it.
   */
  it("keeps the inspirational register off the page", () => {
    for (const phrase of [
      "journey",
      "empower",
      "unlock your potential",
      "a bigger purpose",
      "something bigger",
      "brighter tomorrow",
      "every dream",
      "you\u2019ve got this",
      "you deserve",
    ]) {
      expect(aboutText.toLowerCase()).not.toContain(phrase);
    }
    // Written to a student, not at one.
    expect(aboutText).not.toContain("!");
  });

  it("contains the SAT-origin story and the founder attribution", () => {
    expect(aboutText).toContain("preparing for the SAT");
    expect(aboutText).toContain(MY_STORY_PULLQUOTE);
    expect(aboutText).toContain("Nikita Tejwani");
    expect(aboutText).toContain(`Founder, ${BRAND}`);
  });

  it("ends with a sign-up CTA", () => {
    expect(aboutText).toContain(FINAL_CTA_STORY.heading);
    expect(aboutText).toContain(FINAL_CTA_STORY.support);
    expect(about).toContain(`href="${ROUTES.signUp}"`);
  });

  it("names a moment on every pillar and says what Vezri does in it", () => {
    expect(MY_STORY_PILLARS).toHaveLength(4);
    for (const pillar of MY_STORY_PILLARS) {
      expect(aboutText).toContain(pillar.title);
      expect(aboutText).toContain(pillar.body);
      // A moment the reader has had, not a feature name and not a policy.
      expect(pillar.title).toMatch(/^When /);
    }
  });

  /**
   * The owner retired the square portrait in favour of the wide artwork
   * (2026-09-08). Both halves of that decision are asserted: the page stops
   * rendering the photograph, and the photograph stays in the repo so putting
   * it back is a render decision rather than an archaeology exercise.
   */
  it("renders the story artwork and no longer the retired portrait", () => {
    expect(about).toContain("/brand/story.webp");
    expect(about).not.toContain("/brand/founder.webp");
    expect(existsSync("public/brand/founder.webp")).toBe(true);
  });

  it("describes what is in the artwork, and never with an empty alt", () => {
    // §30.11. It is content, not decoration, and the description has to match
    // the picture: Nikita holds the bow, Vezri is beside her.
    expect(about).toContain(`alt="${STORY_IMAGE_ALT}"`);
    expect(STORY_IMAGE_ALT).toContain("Nikita Tejwani");
    expect(STORY_IMAGE_ALT).toContain("Vezri");
    expect(STORY_IMAGE_ALT).toContain("target");
    expect(about).not.toMatch(/<img[^>]*alt=""[^>]*brand\/story/);
  });

  /**
   * The crop rules, asserted because they are invisible in review and a
   * default centre crop cuts this particular picture in half — Nikita is on
   * the left, the target on the right.
   */
  it("anchors the hero crop to the left and never to the centre", () => {
    expect(about).toContain("object-left");
    expect(about).not.toMatch(/object-cover[^"]*object-center/);
  });

  it("shows the whole picture at phone width rather than cropping it", () => {
    // 4:3 is the artwork's own ratio, so object-cover removes nothing.
    expect(about).toMatch(/aspect-\[4\/3\]/);
  });

  it("does not make a phone download the 1448px original", () => {
    expect(about).toContain('sizes="(max-width: 1200px) 100vw, 1200px"');
  });
});

/**
 * The Vezri block (§30.6) — and the rule it exists to carry.
 *
 * It is the hinge of the page: above it the founder is talking about herself,
 * below it the page is talking to the reader. Most of what follows asserts
 * that hinge rather than the wording, because the wording is allowed to change
 * and the order is not.
 */
describe("the Vezri block on My Story (PRD §30.6)", () => {
  it("introduces her by name and carries both paragraphs", () => {
    expect(aboutText).toContain(MY_STORY_VEZRI.heading);
    for (const paragraph of MY_STORY_VEZRI.body) {
      expect(aboutText).toContain(paragraph);
    }
  });

  it("sits after the SAT story and before the turn outward", () => {
    const built = aboutText.indexOf(`So I built ${BRAND}.`);
    const vezri = aboutText.indexOf(MY_STORY_VEZRI.heading);
    const outward = aboutText.indexOf(MY_STORY_PARAGRAPHS_OUTWARD[0]);
    for (const index of [built, vezri, outward]) expect(index).toBeGreaterThan(-1);
    expect(built).toBeLessThan(vezri);
    expect(vezri).toBeLessThan(outward);
  });

  /**
   * The rule no single copy constant can hold, so it is asserted against the
   * whole rendered page: once this page addresses the reader it does not go
   * back. "The goal is yours." is the sentence that turns it.
   *
   * The founder's byline is the one thing below the turn that names her, and
   * it names her in the third person — so it passes, and for the right reason.
   */
  it("never snaps back to the first person after it turns outward", () => {
    const [before, after] = aboutText.split("The goal is yours.");
    expect(after).toBeTruthy();
    // The half above the turn is still hers, or the split proved nothing.
    expect(before).toMatch(/\bI\b/);
    expect(after).not.toMatch(/\b(I|my|me)\b/i);
  });

  it("uses a pose the hero does not, so the archery motif is not repeated", () => {
    expect(about).toContain(MY_STORY_VEZRI.imageSrc);
    // vezri.webp is the drawn bow and target. The artwork at the top of this
    // page is already that picture; twice on one page reads as one drawing.
    expect(MY_STORY_VEZRI.imageSrc).not.toBe("/brand/vezri.webp");
  });

  it("describes her instead of calling her a mascot, and never with an empty alt", () => {
    // §30.11. She carries part of the argument here — a reader who cannot see
    // the drawing still needs to be told she is working out a route to a
    // summit, because that is what the words beside her claim she does.
    expect(about).toContain(`alt="${MY_STORY_VEZRI.imageAlt}"`);
    expect(about).not.toMatch(/<img[^>]*alt=""[^>]*brand\/vezri-thinking/);
    for (const lazy of ["mascot", "logo", "image of", "picture of", "illustration"]) {
      expect(MY_STORY_VEZRI.imageAlt.toLowerCase()).not.toContain(lazy);
    }
    expect(MY_STORY_VEZRI.imageAlt).toContain(MASCOT);
  });

  it("stacks the mascot above the text on a phone and puts them side by side on desktop", () => {
    // flex-col until sm:flex-row, so the stack order IS the source order and
    // there is no order- class that can drift out of step with it.
    expect(about).toMatch(/flex flex-col[^"]*sm:flex-row/);
    expect(about.indexOf("vezri-thinking")).toBeLessThan(
      about.indexOf(MY_STORY_VEZRI.heading),
    );
  });

  it("borrows no new type sizes for the block", () => {
    // The body is the story's own size and the heading is the hero caption's.
    // Anything else would be a scale invented for one block.
    expect(about).toMatch(/text-\[1\.05rem\]/);
    expect(about).toMatch(/id="meet-vezri" class="text-xl font-semibold text-ink"/);
  });
});

describe("legal, feedback and auth routes (PRD §30.7, §30.8)", () => {
  it("renders product-specific privacy content, not generic boilerplate", () => {
    const t = text(<PrivacyPage />);
    expect(t).toContain(BRAND);
    expect(t).toContain("Google Calendar");
    expect(t).toContain("Execution history");
    expect(t).not.toContain("Calyqen");
  });

  it("renders Vezriqen-specific terms", () => {
    const t = text(<TermsPage />);
    expect(t).toContain(BRAND);
    expect(t).not.toContain("Calyqen");
  });

  it("offers Feedback as the support path without a separate contact form", () => {
    const t = text(<FeedbackPage />);
    expect(t).toContain("Feedback");
    expect(t).not.toMatch(/\bContact us\b/);
  });

  it("makes Continue with Google prominent and brands auth as Vezriqen AI™", () => {
    const signup = text(<AuthPanel mode="signup" />);
    expect(signup).toContain("Continue with Google");
    expect(signup).toContain(BRAND);
  });

  it("states that signing in does not grant calendar access", () => {
    const signup = text(<AuthPanel mode="signin" />);
    expect(signup).toMatch(/doesn\u2019t give Vezri access to your calendar/);
  });
});

describe("accessibility basics (PRD §30.11)", () => {
  it("gives the mascot meaningful alt text in the hero and empty alt when decorative", () => {
    expect(home).toMatch(/alt="Vezri, the Vezriqen AI\u2122 falcon archer[^"]*"/);
    expect(home).toContain('alt=""');
  });

  it("labels both primary navigations", () => {
    expect(header).toContain('aria-label="Primary"');
    expect(footer).toContain('aria-label="Footer"');
  });
});
