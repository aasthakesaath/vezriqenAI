# Vezriqen AI™

**Turn Your Plans Into Progress.**

Plan-to-outcome execution coach. Bring a plan you already have; Vezri helps you
follow it, recover when you get stuck, and stay on track until the outcome is
achieved.

Built to the Phase 1 PRD. Section references below point at that document.

---

## Status

| Milestone | Scope | State |
|---|---|---|
| 1 | Public site — homepage, My Story ♥, legal, feedback, auth shells | **Done** |
| 2 | Google auth + onboarding + plan upload/paste | Not started |
| 3 | AI plan extraction + SMART confirmation + approval | Not started |
| 4 | Today screen + Goal Dashboard + Goal Health | Not started |
| 5 | Reminders/checkpoints + Execution Block Coach + replanning | Not started |
| 6 | Google Calendar + email reminders | Not started |
| 7 | End-to-end testing, accessibility, security review | Not started |

---

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS 3
- Vitest for tests
- Deployed on Vercel

Node is pinned to 22 via `.nvmrc` and `engines`. **Vercel's project Node version
must match** (Settings → General → Node.js Version → 22.x), or CI and production
can build differently.

---

## Local development

```bash
npm ci                 # not `npm install` — respects the lockfile
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

### Before every push

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs exactly these four, in this order. If they pass locally they pass in CI.

---

## Routes

| Route | Purpose |
|---|---|
| `/` | Homepage — hero, `#how-it-works`, progress preview, final CTA |
| `/about` | My Story ♥ — founder story (§30.6) |
| `/privacy` | Privacy policy — Vezriqen-specific data flows |
| `/terms` | Terms of service |
| `/feedback` | Support/contact path (there is no Contact page, by design) |
| `/signin` `/signup` | Auth shells — Continue with Google |
| `/api/feedback` | Feedback delivery |
| `/api/auth/google/start` | OAuth entry point (Milestone 2) |

Deliberately absent per PRD §30.3 and §30.13: no Pricing page, no Contact page,
no standalone Features page.

---

## Environment variables

See `.env.example` for the full annotated list. Set these in **Vercel → Settings
→ Environment Variables**, not in the repo.

Needed now:

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata |
| `NEXT_PUBLIC_LEGAL_OWNER` | Footer and legal pages — do not hardcode an unverified entity (§30.8) |
| `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` | Contact address on legal pages |
| `FEEDBACK_WEBHOOK_URL` | Where feedback is delivered. **Without it the form returns an error rather than silently dropping messages.** |

Needed from Milestone 2: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `AUTH_SECRET`, `DATABASE_URL`, storage credentials,
`ANTHROPIC_API_KEY`, email provider key.

---

## Deployment

Production deploys automatically from `main` once the repo is connected in
Vercel → Settings → Git.

### Milestone workflow

Each milestone gets its own branch, so a broken milestone can never take
production down:

```bash
git checkout -b milestone-2-auth
# ...work...
git push -u origin milestone-2-auth
```

Vercel builds a **preview URL** for the branch. Review it, then open a PR. CI
must pass before merge. Merging to `main` deploys to production.

### Recommended one-time GitHub setup

Settings → Branches → add a rule for `main`:

- Require a pull request before merging
- Require status checks to pass → select **Lint, typecheck, test, build**

This is what makes unattended deploys safe: a milestone that fails tests cannot
reach production, whoever pushed it.

---

## Design decisions worth knowing

- **`berry` (`#A82449`) is not in PRD Palette A.** Dusty rose `#C98F9D` cannot
  carry white text at WCAG AA, and §30.11 requires accessible contrast. Palette A
  carries the soft canvas; `berry` carries buttons, links and headings. The value
  is sampled from the approved mockup's own CTA.
- **Copy lives in `src/lib/site.ts`**, not inline in components, so the tests
  assert against the specification rather than a retyped duplicate.
- **The feedback API never silently succeeds.** With no `FEEDBACK_WEBHOOK_URL`
  configured it returns a 503 telling the user to email instead.
- **Google sign-in requests `openid email profile` only.** Calendar access is a
  separate consent step (§5, §23, §30.7).
- **The founder portrait is real and approved.** §30.6 forbids a generated one.
  Override via `NEXT_PUBLIC_FOUNDER_PORTRAIT` only with another approved image.

---

## Tests

`tests/public-site.test.tsx` asserts the §30.13 acceptance criteria directly:
brand always rendered as Vezriqen AI™, the heart present in My Story ♥, no
Contact/Pricing/Features navigation, Sign Up Free in header + hero + final CTA,
exact PRD copy, homepage under 400 words, one `<h1>` per page.

```bash
npm test
```
