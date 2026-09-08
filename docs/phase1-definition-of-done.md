# Phase 1 — Definition of Done (PRD §26)

Assessed at the end of Milestone 7.

## How to read the status column

- **Built + verified** — implemented, and exercised by an automated test or a
  live run recorded in this session.
- **Built + unverified end-to-end** — implemented and unit-tested, but never
  exercised against the real database with a signed-in user.

That distinction exists because of one environment limitation, stated plainly
here rather than buried: **this build session could never reach Supabase.**
`*.supabase.co` is refused by the sandbox's egress proxy, and the Supabase MCP
connector was down. The schema was therefore applied by the project owner from
the SQL in `supabase/migrations/`, and no code path that requires a live session
— sign-in, upload, activation, check-in — has been run against the real project
from here. Everything below marked *unverified end-to-end* needs one manual pass
on the deployed site before Phase 1 is genuinely signed off.

The AI paths were verifiable, because `api.anthropic.com` was reachable, and
they were run against the live model.

---

| # | §26 requirement | Status | Evidence |
|---|---|---|---|
| 1 | Sign in with Google | Built + unverified end-to-end | Supabase OAuth, scopes pinned to `openid email profile`; `tests/auth-scopes.test.ts` proves sign-in requests no Google API scope. Middleware fails closed — verified returning 307 → `/signin` when the backend is unreachable. |
| 2 | Optionally connect Google Calendar | Built + unverified end-to-end | Separate OAuth client, separate consent, declinable. `tests/calendar-email.test.ts` proves the two scope sets are disjoint. **Needs the second Google Cloud project** (see README) before it can run at all. |
| 3 | Upload or paste an externally created plan | Built + verified (validation) | PDF/DOCX/TXT/MD/JPG/PNG, 25 MB, 100 pages. `tests/upload-validation.test.ts` covers content sniffing, including a renamed executable declared as `application/pdf`. Storage round-trip unverified. |
| 4 | Receive a correct, concise target summary | Built + verified | Live model run extracted a stated exam date rather than inventing one, and returned `null` for a plan with no dates (`tests/ai-extraction.live.test.ts`). |
| 5 | Answer no more than a few missing-information questions | Built + verified | Schema caps `clarifying_questions` at 3; the review flow renders at most 3. |
| 6 | Confirm a SMART goal and execution plan | Built + unverified end-to-end | Target card with Looks right / Adjust, plan confirmation, Start Goal. Activation is the only thing that creates reminders. |
| 7 | Today view with up to 3 priority actions | Built + verified | `tests/acceptance.test.ts` §25.D: 100 candidate tasks still yield exactly 3 cards, highest-value first. |
| 8 | In-app and email reminders with sensible lead time | Built + verified (in-app), unverified (email send) | Lead-time engine tested in `tests/lead-time.test.ts`. Email verified only on the *unsent* path — no provider key exists yet, which is the documented state. |
| 9 | Tell Vezri what actually happened | Built + unverified end-to-end | Done / Partly / Snooze / Not done / I'm stuck, plus signed email links. Unanswered stays `unconfirmed`. |
| 10 | Not Done or I'm Stuck gives a specific intervention | Built + verified | `tests/execution-coach.test.ts` proves rescheduling is absent from the intervention set for avoidance and overwhelm, and that the no-AI fallback still returns a concrete step for every barrier. |
| 11 | Approve a replan that preserves the final goal | Built + verified | `isSafeReplan` rejects any proposal moving the target date; tested in `tests/execution-coach.test.ts` and §25.C. |
| 12 | See Goal Health | Built + verified | Deterministic score with stored inputs; 11 tests, including §4.10 weighting. |
| 13 | Ask "What am I missing?" and get a useful audit | Built + verified | §25.E: a plan of nothing but overdue work returns zero gaps, while a required deliverable with nothing producing it is found. |
| 14 | Vezri learns basic preferences from behaviour | Built + verified (logic) | `recomputeExecutionProfile` derives windows, recurring barriers and accepted interventions from observed behaviour only. Accumulation over time unverified. |
| 15 | Complete the loop without maintaining a task manager | Built + unverified end-to-end | The loop exists: plan in → target → activate → Today → check in → coach → replan. Never walked in one sitting against a live database. |

---

## Scope discipline (§3)

Nothing under "Explicitly not Phase 1" was built. No native app, no SMS or
WhatsApp, no social feed, no team features, no Kanban or Gantt, no wearables, no
autonomous third-party email, no editing of non-Vezri calendar events, no
general-purpose plan generation, no coach marketplace, no streaks or points.

## Accessibility (§30.11)

axe-core, WCAG 2.1 A + AA, across all eight public routes at 375px and 1440px:
**0 violations**. One h1 per page, `lang` set, `main` landmark present, every
image has an `alt`, no horizontal scroll at 375px.

The pass found and fixed two genuine contrast failures in the Milestone 1
palette, which had been used as text:

| Token | Was | Now | Contrast on white |
|---|---|---|---|
| `rose` | `#C98F9D` | `#AE566B` | 2.66:1 → 4.84:1 |
| `mauve-light` | `#8E7078` | `#876A72` | 4.43:1 → 4.84:1 |

Both were darkened along the same hue and saturation, and both clear 4.5:1 on
the lightest ground they sit on rather than only on pure white. `rose.soft` is
untouched, so every decorative fill and border is exactly as it was. This is the
one deliberate change to Milestone 1's rendered design, made because §30.11
requires accessible contrast and the accessibility pass is what Milestone 7 is
for.

## Security (§23)

`tests/security.test.ts` encodes the review so its findings cannot regress:
no server secret reachable from a client component, every API route either
authenticated or on a documented public allowlist, both sign-in redirect guards
rejecting protocol-relative URLs, uploaded document text fenced and declared to
the model as data rather than instructions, and Calendar writes gated on our own
ownership record.

RLS is enabled on all 17 tables with owner-scoped policies; the two tables
holding secrets have RLS on and no policies at all, which denies `anon` and
`authenticated` outright.

One finding was fixed during the review: `/api/auth/google/start` accepted
`//evil.com` as a `next` value. The callback would have rejected it, but relying
on a single guard is the wrong shape, so both ends now check.

## Known gaps

1. **No end-to-end run against the live database.** The largest gap, and the
   reason for the status column above.
2. **Calendar cannot run until the second Google Cloud project exists.**
3. **Email is unproven in the sending direction.** Only the correct
   no-key behaviour is verified.
4. **The Supabase security advisor was never run by this session.** It was
   unreachable throughout. `supabase/verify_security.sql` reproduces its main
   checks and returned clean, but that is a substitute, not the advisor.
5. **Actual-vs-estimated duration is not learned yet.** It needs timed sessions,
   which arrive with calendar blocks; the profile reports zero samples rather
   than inventing a ratio.
6. **No rate limiting** on the AI-backed endpoints.
