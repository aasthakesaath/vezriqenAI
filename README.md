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
| 2 | Google auth + onboarding + plan upload/paste | **Done** |
| 3 | AI plan extraction + SMART confirmation + approval | **Done** |
| 4 | Today screen + Goal Dashboard + Goal Health | **Done** |
| 5 | Reminders/checkpoints + Execution Block Coach + replanning | **Done** |
| 6 | Google Calendar + email reminders | **Done** |
| 7 | End-to-end testing, accessibility, security review | **Done** |

Phase 1 Definition of Done (§26) is verified in `docs/phase1-definition-of-done.md`.

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
| `FEEDBACK_EMAIL_TO` | Where feedback is delivered. **Without a working email provider the form says it did not send, rather than pretending it did.** |

### Supabase

Supabase provides auth, database and file storage, and signs the session — so
there is no `AUTH_SECRET` and no second auth system to keep in step.

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client; every read is constrained by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses RLS — never prefix with `NEXT_PUBLIC_` |

The Google OAuth client id and secret live in the **Supabase dashboard**
(Authentication → Providers → Google), not here. Google Cloud needs
`https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect
URI, and Supabase needs `https://www.vezriqen.com/api/auth/google/callback`
under Authentication → URL Configuration → Redirect URLs.

Apply `supabase/migrations/0001…0004` in order, then run
`supabase/verify_security.sql` and `supabase/verify_rls_cross_user.sql`.

### AI

| Variable | Why |
|---|---|
| `ANTHROPIC_API_KEY` | Plan extraction, coaching and audits (§22) |
| `AI_MODEL` | Optional override; defaults to a current Claude model |

### Google Calendar — needs its own Google Cloud project

Calendar uses a **different OAuth client from sign-in**, and this is not
optional. The production sign-in client is PUBLISHED with only
`openid email profile`. Adding a sensitive scope to a published app before
verification imposes a permanent user cap on the project that cannot be reset.

Create a **second Google Cloud project in Testing status** for Calendar
development, and add exactly these two scopes:

```
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.events
```

`calendar.freebusy` rather than `calendar.readonly` is deliberate: Vezri needs
to know when you are busy, not what you are doing (§23, minimum scopes).

Authorised redirect URI: `https://www.vezriqen.com/api/calendar/callback`.

| Variable | Why |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | The *second* project's client |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | " |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `https://www.vezriqen.com/api/calendar/callback` |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | 32 bytes base64 — `openssl rand -base64 32` |

### Email and scheduled reminders

| Variable | Why |
|---|---|
| `EMAIL_PROVIDER_API_KEY` | Resend key. **Optional** — see below |
| `EMAIL_FROM` | Sender identity |
| `EMAIL_ACTION_SIGNING_KEY` | Signs Done/Snooze/Stuck links — `openssl rand -base64 32` |
| `CRON_SECRET` | Bearer secret for `/api/cron/reminders` — `openssl rand -base64 32` |

**Without `EMAIL_PROVIDER_API_KEY` the product still works.** Reminders appear
in full in the in-app reminder centre, the delivery attempt is logged loudly,
and the reminder is recorded as `suppressed` — never as `sent`. A check
constraint on `reminders` makes a `sent_at` alongside a non-sent status
impossible to store, so the record cannot drift into claiming a delivery that
did not happen.

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
- **Feedback and email auth are ported from the sibling products, not
  rewritten.** The public feedback route comes from Meriqen (no session, stores
  nothing, and never claims a delivery it did not achieve); email sign-in,
  sign-up and password reset come from Calyqen, including its deliberately
  vague sign-in error, which exists so the form cannot be used to discover
  whether someone has an account here.
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
