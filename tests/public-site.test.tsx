import { describe, expect, it } from "vitest";
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
import {
  BRAND,
  CTA_PRIMARY,
  CTA_SUPPORT,
  CTA_SUPPORT_SHORT,
  FINAL_CTA_HOME,
  HERO,
  HOW_IT_WORKS,
  HOW_IT_WORKS_TITLE,
  MY_STORY_LABEL,
  MY_STORY_PULLQUOTE,
  PERSONALIZATION,
  ROUTES,
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

const home = html(<HomePage />);
const homeText = text(<HomePage />);
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

  it("opens on the first stage, in plain language", () => {
    expect(text(<VezriWorking stages={UNDERSTANDING_STEPS} />)).toContain(
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
      expect(text(<VezriWorking stages={UNDERSTANDING_STEPS} />).toLowerCase()).not.toContain(
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

  it("uses the approved mascot asset and hides it from screen readers", () => {
    expect(working).toContain("/brand/vezri.webp");
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

describe("My Story page (PRD §30.6, §30.13)", () => {
  it("uses the approved eyebrow, headline and subhead", () => {
    expect(aboutText).toContain("A real student. A real problem. A bigger purpose.");
    expect(aboutText).toContain(`Why I Built ${BRAND}`);
    expect(aboutText).toContain("Sometimes a personal challenge can lead to something bigger.");
  });

  it("contains the SAT-origin story and the founder attribution", () => {
    expect(aboutText).toContain("preparing for the SAT");
    expect(aboutText).toContain(MY_STORY_PULLQUOTE);
    expect(aboutText).toContain("Nikita Tejwani");
    expect(aboutText).toContain(`Founder, ${BRAND}`);
  });

  it("ends with a sign-up CTA", () => {
    expect(aboutText).toContain("Let's make it happen.");
    expect(about).toContain(`href="${ROUTES.signUp}"`);
  });

  it("renders the approved founder portrait with a descriptive alt text", () => {
    expect(about).toContain("/brand/founder.webp");
    expect(about).toMatch(/alt="Nikita Tejwani, Founder, Vezriqen AI\u2122"/);
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
