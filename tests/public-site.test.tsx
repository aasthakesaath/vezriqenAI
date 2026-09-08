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
import {
  BRAND,
  CTA_PRIMARY,
  CTA_SUPPORT,
  HOW_IT_WORKS,
  MY_STORY_LABEL,
  MY_STORY_PULLQUOTE,
  ROUTES,
} from "@/lib/site";

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
    expect(homeText).toContain("Your goals. A smarter way.");
    expect(homeText).toContain("Turn Your Plans");
    expect(homeText).toContain("Into Progress.");
    expect(homeText).toContain(
      "Upload your plan. Vezri helps you follow it, adjust when life happens, and achieve your goals.",
    );
  });

  it("carries the how-it-works anchor and all four cards", () => {
    expect(home).toContain('id="how-it-works"');
    for (const card of HOW_IT_WORKS) {
      expect(homeText).toContain(card.title);
      expect(homeText).toContain(card.body);
    }
  });

  it("includes the progress preview and final CTA sections", () => {
    expect(homeText).toContain("Progress Feels Good.");
    expect(homeText).toContain("Ready to Turn Your Plan Into Progress?");
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
    expect(homeText.trim().split(/\s+/).length).toBeLessThan(400);
  });

  it("exposes exactly one h1", () => {
    expect((home.match(/<h1/g) ?? []).length).toBe(1);
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
