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
export const CTA_SUPPORT = "Free to use \u00b7 No credit card \u00b7 Start in under a minute";
/** The final CTA drops the third clause: by then "start in under a minute" is
 *  no longer news, and the shorter line reads as reassurance rather than pitch. */
export const CTA_SUPPORT_SHORT = "Free to use \u00b7 No credit card";

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

/* --------------------------------------------------------------------------
 * Homepage §1 — the hero.
 *
 * The headline is split because the accent lands on the second half: the
 * promise is not "make a plan" (every planner offers that) but "finish it".
 * Kept to one sentence of support — anything more pushes the CTA below the
 * fold on a phone, which is the one thing §11 forbids.
 * ---------------------------------------------------------------------- */
export const HERO = {
  /** Rendered uppercase by CSS; stored sentence-case so screen readers and
   *  the brand rule are unaffected by the typographic treatment. */
  eyebrow: "Your goals. A smarter way.",
  headingLead: "Don\u2019t Just Make a Plan.",
  headingTurn: "Finish It.",
  support: `Upload your plan. ${MASCOT} helps you follow it, get unstuck, adjust when life happens, and reach the goal.`,
} as const;

/**
 * Homepage §2 — "How Vezri Keeps You Moving".
 *
 * Four cards, one line of body each. The order is the product's own arc:
 * bring the plan in, work out what matters, recover when it slips, keep the
 * goal when the path has to change. The last two are the differentiators, so
 * they are never dropped on a narrow screen — the grid stacks, it does not
 * truncate.
 */
export const HOW_IT_WORKS = [
  {
    id: "upload",
    title: "Upload Your Plan",
    body: "Bring a PDF, document, or plan created with any AI.",
  },
  {
    id: "matters",
    title: "Know What Matters",
    body: `Works backward from your goal and finds the next useful step.`,
  },
  {
    id: "unstuck",
    title: "Get Unstuck",
    body: `Didn\u2019t do it? ${MASCOT} helps figure out what got in the way and finds a way forward.`,
  },
  {
    id: "adjust",
    title: "Adjust & Keep Going",
    body: `When life changes, ${MASCOT} adjusts the path without losing the goal.`,
  },
] as const;

export const HOW_IT_WORKS_TITLE = `How ${MASCOT} Keeps You Moving`;

/* --------------------------------------------------------------------------
 * Homepage §3 — the difference.
 *
 * The single most important section on the page: it is the one that separates
 * this from a reminder app. Deliberately not a feature matrix. Two short
 * columns and one sentence in Vezri's voice do more for a five-second read
 * than a checklist ever would, and a dense comparison table invites the
 * visitor to audit us rather than to recognise themselves.
 * ---------------------------------------------------------------------- */
export const USP = {
  heading: "More Than Reminders.",
  subheadLead: "Most apps move a missed task.",
  subheadTurn: `${MASCOT} helps solve why it was missed.`,
  /** Left column: what a planner, tracker or calendar tool does. */
  ordinary: { label: "Most Apps", steps: ["Plan", "Remind", "Reschedule"] },
  /** Right column: the same start, a different ending. */
  ours: {
    label: BRAND,
    steps: ["Plan", "Act", "Understand what got in the way", "Adjust", "Achieve"],
  },
  quote: `You didn\u2019t finish it. Let\u2019s figure out what got in the way \u2014 not just move it to tomorrow.`,
} as const;

/* --------------------------------------------------------------------------
 * Homepage §4 — lead time, shown rather than explained.
 *
 * Each row is a concrete situation, the shift Vezri makes, and the one-line
 * reason. The reason column is what stops this reading as a scheduling trick:
 * the point is that Vezri knows *why* the date has to move.
 * ---------------------------------------------------------------------- */
export const THINKS_AHEAD = [
  {
    trigger: "Recommendation due Nov 1",
    move: "Start Oct 10",
    why: "Another person needs time to respond.",
  },
  {
    trigger: "Morning routine at 6:30 AM",
    move: "Prepare tonight",
    why: "The useful reminder comes before the morning starts.",
  },
  {
    trigger: "Certification in 6 weeks",
    move: "Recovery plan",
    why: "You\u2019re 3 hours behind, but the goal is still achievable.",
  },
] as const;

export const THINKS_AHEAD_HEADING = `${MASCOT} Thinks Ahead.`;

/* --------------------------------------------------------------------------
 * Homepage §5 — personalisation.
 *
 * Every line describes the plan or the work, never the person. "Large tasks
 * keep getting postponed" is an observation about tasks; "you procrastinate"
 * is a diagnosis, and this product does not make them.
 * ---------------------------------------------------------------------- */
export const PERSONALIZATION = {
  headingLead: "Your Plan Shouldn\u2019t Be Generic.",
  headingTurn: "Neither Should Your Coach.",
  support: `${MASCOT} learns when you actually get things done and adapts over time.`,
  rows: [
    { observation: "Evening reminders work better for you", response: `${MASCOT} shifts them later.` },
    { observation: "Large tasks keep getting postponed", response: `${MASCOT} breaks them down.` },
    { observation: "Outside dependencies take longer", response: `${MASCOT} starts them earlier.` },
  ],
} as const;

/* --------------------------------------------------------------------------
 * Homepage §6 — My Story teaser. Two lines and a link; the story itself stays
 * on /about, where §30.6 put it.
 *
 * First person, and it stays first person: this is the founder's own week, not
 * a claim about the reader's. The turn-outward rule that governs /about starts
 * at the Vezri block on that page and has no bearing here.
 *
 * The second line was "The hard part wasn't making it — it was following it."
 * True, but it is the sentence every planner app writes, and the 2026-09-14
 * pass replaced abstractions with the specific thing that actually happened.
 * It also now says almost exactly what the closing line of /about says, which
 * made the teaser a summary of the payoff rather than a reason to go and read
 * it.
 *
 * Both lines have to survive on ONE visual line each: they render as a couplet
 * at `text-lg` inside `max-w-lg` with `mt-1` between them, which is about 57
 * characters. A second line that wraps turns the couplet into three lines and
 * loses the beat.
 * ---------------------------------------------------------------------- */
export const STORY_TEASER = {
  heading: "Built From a Real Problem \u2665",
  lines: [
    "I had an SAT study plan.",
    "It stopped matching the week I was actually having.",
  ],
  cta: `Read ${MY_STORY_LABEL}`,
} as const;

/** Homepage §7 — the closing ask. */
export const FINAL_CTA_HOME = {
  heading: "Have a Plan You\u2019re Ready to Finish?",
  support: `Upload it. Let ${MASCOT} help you keep moving.`,
} as const;

/* --------------------------------------------------------------------------
 * PRD §30.6 — the My Story narrative.
 *
 * Still verbatim from the PRD; it is just a later PRD. The owner directed a
 * copy pass on 2026-09-14 and §30.6 was rewritten in the same commit, so the
 * spec and the page did not drift apart. Two things came out of that pass and
 * both are rules rather than preferences:
 *
 *   ONE READER. A student who set a goal and could not hold themselves to it.
 *   Written to, not down to — no teen-speak, no exclamation marks. The SAT
 *   specifics stay: they are what makes the story land, and the shape of it —
 *   a plan that stopped matching the week — is recognisable to a student who
 *   is not sitting that exam.
 *
 *   THE PAGE TURNS OUTWARD AT MY_STORY_VEZRI AND STAYS TURNED. Everything
 *   above it is first person. Everything below it addresses the reader and
 *   never snaps back. No constant here can hold that on its own, so
 *   tests/public-site.test.tsx asserts it against the rendered page.
 *
 * The register the pass removed, for anyone adding copy later: "a bigger
 * purpose", "something bigger", "brighter tomorrow", "For Every Dream",
 * "You've Got This", "you deserve a partner".
 * ---------------------------------------------------------------------- */
export const MY_STORY_EYEBROW = "A real student. A real problem. One falcon.";
export const MY_STORY_SUBHEAD = "It started with a study plan I couldn\u2019t keep.";

export const MY_STORY_PARAGRAPHS = [
  `I created ${BRAND} while I was preparing for the SAT.`,
  "I had a detailed study plan, but I kept falling behind. Some days I didn\u2019t know how to start. Other days school ran long or something came up, and the plan carried on describing a week I wasn\u2019t having. A reminder could tell me what I\u2019d missed. It couldn\u2019t tell me why, or what to do next.",
] as const;

export const MY_STORY_PULLQUOTE =
  "I wanted something that understood me, helped me get unstuck, and kept me moving.";

/** The last line in my own voice. Everything after the Vezri block is the reader's. */
export const MY_STORY_PARAGRAPHS_AFTER = [`So I built ${BRAND}.`] as const;

/**
 * The Vezri block — the hinge of the page.
 *
 * The heading and the first paragraph are still mine; the second hands the
 * goal to the reader, and nothing below it speaks in the first person again.
 *
 * The pose is `thinking`, not the archer in vezri.webp. The artwork at the top
 * of the page is already a drawn bow aimed at a target, and using the archer
 * again two blocks later makes it look like the brand owns one drawing. This
 * pose carries a thought bubble with a winding route up to a flag, which is
 * also the better picture for what the paragraph beside it claims: the way
 * there, not the shot.
 *
 * It names the file directly rather than importing POSES from lib/vezri-poses.
 * That map is product state -> pose and its alt text describes the STATE
 * ("Vezri is working this out"). Nothing on a marketing page is in a product
 * state, and borrowing it would let a change to the loading-card copy silently
 * rewrite this description.
 *
 * Never alt="" and never "the mascot" (§30.11). Here the drawing carries part
 * of the argument, so a reader who cannot see it is still told that she is
 * working out a route to a summit — which is precisely what the words beside
 * her claim she does.
 */
export const MY_STORY_VEZRI = {
  heading: `Meet ${MASCOT}, My Falcon Guide`,
  body: [
    "I chose a falcon because reaching a goal takes more than a plan \u2014 it takes focus, timing, and the ability to adjust course.",
    `The goal is yours. ${MASCOT} doesn\u2019t hit the target for you \u2014 she helps you aim, adjust when life gets in the way, and keep moving until you reach it.`,
  ],
  imageSrc: "/brand/vezri-thinking.webp",
  imageWidth: 357,
  imageHeight: 760,
  imageAlt: `${MASCOT}, the ${BRAND} falcon: a dusty-rose bird with a flower tucked behind her ear and a small satchel over one wing, one claw at her chin, working out a winding route up to the flag at the summit`,
} as const;

/** After the Vezri block. Second person, and it stays that way. */
export const MY_STORY_PARAGRAPHS_OUTWARD = [
  `It doesn\u2019t have to be an exam. ${MASCOT} works the same way for a certification, a routine you want to hold to, or something long-term like starting a company.`,
  "Making the plan is never the hard part. Following it is \u2014 and that part you don\u2019t have to do on your own.",
] as const;

/**
 * The four cards under the story. Each names a moment the reader has had, then
 * says what Vezri does in it.
 *
 * They replace four that restated the prose directly above them and did it in
 * the wrong voice: two in the first person, below the turn, and two ("For
 * Every Dream", "You've Got This") in the register this page does not use.
 *
 * The titles follow the same rule as PERSONALIZATION above — describe the work
 * or the week, never the person. "When a day gets missed", not "when you fall
 * behind": the second is a diagnosis, and this product does not make them.
 */
export const MY_STORY_PILLARS = [
  {
    id: "next",
    title: "When the next step isn\u2019t obvious",
    body: `${MASCOT} works backward from your goal and names the one thing to do next.`,
  },
  {
    id: "missed",
    title: "When a day gets missed",
    body: `It doesn\u2019t just move to tomorrow. ${MASCOT} works out what got in the way, then changes the plan around it.`,
  },
  {
    id: "week",
    title: "When the week doesn\u2019t cooperate",
    body: "A test moves, something runs late, you get ill. The plan changes shape. The goal doesn\u2019t.",
  },
  {
    id: "waiting",
    title: "When something needs another person",
    body: `A recommendation letter, a reply, a signature. ${MASCOT} counts backward from when it\u2019s due and tells you when to ask.`,
  },
] as const;

/** §30.6's closing ask, kept beside the homepage's so the two stay in step. */
export const FINAL_CTA_STORY = {
  heading: "Have a goal ready? Let\u2019s make it happen.",
  support: `Bring the plan you already have. ${MASCOT} takes it from there.`,
} as const;

export const FOUNDER = { name: "Nikita Tejwani", title: `Founder, ${BRAND}` } as const;

/**
 * The square founder photograph. RETIRED from the page, kept in the repo.
 *
 * The owner retired it in favour of the wide story artwork below (decision,
 * 2026-09-08). Nothing renders it now, and this constant survives on purpose:
 * the file stays at public/brand/founder.webp and this is the pointer to it,
 * so putting it back is a render decision rather than an archaeology exercise.
 * tests/public-site.test.tsx asserts both halves — the file is still there,
 * and /about no longer references it.
 */
export const FOUNDER_PORTRAIT_SRC =
  process.env.NEXT_PUBLIC_FOUNDER_PORTRAIT ?? "/brand/founder.webp";

/**
 * The My Story hero — the wide founder-and-Vezri artwork.
 *
 * 1448×1086, 4:3 landscape, and that shape is the whole reason /about is laid
 * out the way it is: it replaces a square portrait that sat in a sidebar, and
 * a landscape image with two subjects in a portrait slot is either letterboxed
 * into a stripe or cropped through somebody's face.
 *
 * PRD §30.6 forbids a *generated* founder portrait, and the founder.webp this
 * replaces is recorded as the real approved photograph. Retiring it for
 * illustrated artwork is the owner's call, made explicitly — this comment is
 * the record of that, not an objection.
 */
export const STORY_IMAGE_SRC = process.env.NEXT_PUBLIC_STORY_IMAGE ?? "/brand/story.webp";

/**
 * Alt text for the hero (§30.11). Describes what is actually in the picture.
 *
 * "falcon archer" was wrong once the artwork arrived: Vezri is not the one
 * with the bow. Nikita draws it, aiming right, and Vezri is at her shoulder on
 * the left — which is also why the layout anchors every crop to the left.
 * Never alt="": this is content, not decoration.
 */
export const STORY_IMAGE_ALT = `${FOUNDER.name} drawing a bow toward a target in a sunlit rose garden, with ${MASCOT}, the ${BRAND} falcon, at her shoulder`;

/**
 * The handwritten note under the artwork. Decorative, and still bound by the
 * page's register: it replaced "Real challenges. Brighter tomorrow.", which is
 * the exact inspirational move the 2026-09-14 pass took out everywhere else.
 * This one describes what is actually in the picture instead.
 *
 * The heart is not in the string — the caption renders it as an aria-hidden
 * span, so the motif §30.6 asks for is not read out as a word.
 */
export const STORY_IMAGE_NOTE = `${MASCOT} and me, aiming at the same thing.`;
