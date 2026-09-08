/**
 * Single source of truth for public-site branding, navigation and CTA copy.
 * Copy strings are taken verbatim from PRD §30.2–§30.9 so that the UI tests can
 * assert against the specification rather than against a hand-typed duplicate.
 */

export const BRAND = "Vezriqen AI\u2122";
export const BRAND_LINE = "Aim. Adjust. Achieve.";
export const MASCOT = "Vezri";

/** PRD §30.3 — the one primary CTA on every public surface. */
export const CTA_PRIMARY = "Sign Up Free";
export const CTA_SUPPORT = "Free to use \u00b7 no credit card \u00b7 start in under a minute";

/** PRD §30.4 / §30.9 — the heart is part of the visible label. */
export const MY_STORY_LABEL = "My Story \u2665";

export const ROUTES = {
  home: "/",
  howItWorks: "/#how-it-works",
  about: "/about",
  privacy: "/privacy",
  terms: "/terms",
  feedback: "/feedback",
  signIn: "/signin",
  signUp: "/signup",
} as const;

/**
 * Desktop header order. No Pricing, no Contact.
 *
 * PRD §30.4 also lists Privacy here, but the owner removed it from the top
 * menu (2026-09-08). Privacy remains in the footer, which §30.9 requires and
 * which keeps the policy one click away from every page — the legal
 * obligation is reachability, not placement in the primary nav.
 */
export const HEADER_NAV = [
  { label: "How It Works", href: ROUTES.howItWorks },
  { label: MY_STORY_LABEL, href: ROUTES.about },
] as const;

/** PRD §30.9 — small, quiet footer. No Contact. */
export const FOOTER_NAV = [
  { label: MY_STORY_LABEL, href: ROUTES.about },
  { label: "Privacy", href: ROUTES.privacy },
  { label: "Terms", href: ROUTES.terms },
  { label: "Feedback", href: ROUTES.feedback },
] as const;

/**
 * PRD §30.8 / §30.9 — do not hardcode an unverified legal owner. This stays a
 * configuration value until the Vezriqen legal entity is confirmed.
 */
export const LEGAL_OWNER = process.env.NEXT_PUBLIC_LEGAL_OWNER ?? BRAND;
export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL ?? "privacy@vezriqen.com";
export const LEGAL_LAST_UPDATED = "September 8, 2026";

/** PRD §30.5 — four how-it-works cards, homepage only. */
export const HOW_IT_WORKS = [
  {
    id: "upload",
    title: "Upload Your Plan",
    body: "Share your plan (PDF, Word, image, or text) and turn it into simple steps.",
  },
  {
    id: "schedule",
    title: "Smart Scheduling",
    body: "Vezri works with your calendar to find the right time and starts important work early enough.",
  },
  {
    id: "track",
    title: "Stay On Track",
    body: "Context-aware reminders, check-ins, and flexible adjustments when life changes.",
  },
  {
    id: "unstuck",
    title: "Get Unstuck",
    body: "If you do not complete a task, Vezri helps identify what got in the way and finds the smallest useful way forward.",
  },
] as const;

/** PRD §30.6 — approved My Story narrative, kept as data so it stays verbatim. */
export const MY_STORY_PARAGRAPHS = [
  `I created ${BRAND} while I was preparing for the SAT.`,
  "I had a detailed study plan, but I kept falling behind. Some days I didn't know how to start. Other days school and life got busy. A reminder could tell me what I missed, but it didn't help me understand why \u2014 or what to do next.",
] as const;

export const MY_STORY_PULLQUOTE =
  "I wanted something that understood me, helped me get unstuck, and kept me moving.";

export const MY_STORY_PARAGRAPHS_AFTER = [
  `So I built ${BRAND}.`,
  `Now, ${MASCOT} helps people turn plans into real progress \u2014 whether the goal is an exam, a certification, a healthier routine, or a long-term dream like starting a company.`,
  "Because having a plan is just the beginning. You deserve a partner that helps you follow through.",
] as const;

export const FOUNDER = { name: "Nikita Tejwani", title: `Founder, ${BRAND}` } as const;

/**
 * PRD §30.6 requires a real, user-approved founder image and forbids a generated
 * one. This photograph was supplied and approved by the founder herself.
 * Override with NEXT_PUBLIC_FOUNDER_PORTRAIT to swap it without a code change.
 */
export const FOUNDER_PORTRAIT_SRC =
  process.env.NEXT_PUBLIC_FOUNDER_PORTRAIT ?? "/brand/founder.webp";

/**
 * The My Story hero — the wide founder-and-Vezri artwork (owner decision,
 * 2026-09-08: it replaces the portrait rather than joining it).
 *
 * Null until the asset is actually in public/brand/. The page renders the
 * original portrait layout while this is null, so production never points at a
 * file that does not exist. Activating it is one line: give this a default of
 * "/brand/story.webp", or set NEXT_PUBLIC_STORY_IMAGE.
 *
 * Note for whoever lands the asset: PRD §30.6 says not to use a *generated*
 * founder portrait, and the square founder.webp it replaces is recorded as the
 * real approved photograph. Retiring that in favour of illustrated artwork is
 * the owner's call, made explicitly — this comment is the record of it, not an
 * objection.
 */
export const STORY_IMAGE_SRC = process.env.NEXT_PUBLIC_STORY_IMAGE ?? null;

/** Alt text for the hero. Describes what is in it, per §30.11. */
export const STORY_IMAGE_ALT = `${FOUNDER.name} with ${MASCOT}, the ${BRAND} falcon archer, drawing a bow toward a target`;
