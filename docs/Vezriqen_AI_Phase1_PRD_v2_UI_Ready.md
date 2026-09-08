# Vezriqen AI — Phase 1 Product Requirements Document

**Plan-to-Outcome Execution Coach**  
**Version 2.0 • September 8, 2026**  
**Product principle:** Simple for the user. Intelligent underneath.

---

## 0. Instructions for Claude Code / Astra / Other Coding Agents

This PRD is the product source of truth for Phase 1. It is intentionally tool-agnostic and can be used with Claude Code, Astra, or another coding agent.

Before writing code:
1. Read the entire PRD.
2. Inspect the existing repository and reuse the existing stack where practical.
3. Produce a short implementation plan, schema plan, and milestone breakdown.
4. Do not expand scope without explicit approval.
5. Preserve the central UX rule: the user should do as little configuration as possible.
6. Treat AI outputs as structured data, validate them against schemas, and never let free-form model output directly mutate critical user data.
7. Major plan changes, calendar writes, and newly created commitments require user confirmation.
8. If a technical choice conflicts with this PRD, preserve the product behavior and document the implementation tradeoff.

---

# 1. Product Thesis

Vezriqen is **not** another task manager, calendar optimizer, habit tracker, or AI plan generator.

The Phase 1 promise is:

> **Bring Vezri a plan. Vezri helps you actually follow it, recover when you get stuck, and stay on track until the outcome is achieved.**

The default starting point is a plan created elsewhere — for example by ChatGPT, Claude, Gemini, a coach, teacher, trainer, consultant, counselor, or the user. The user uploads the plan instead of manually recreating goals, milestones, deadlines, and tasks.

Vezri then:
- understands the desired outcome;
- converts it into a concise, confirmable SMART target;
- extracts milestones, tasks, deadlines, dependencies, evidence, and constraints;
- works backward to calculate when important work must start;
- fits near-term work around the user's real Google Calendar;
- sends context-aware in-app and email reminders;
- requires an execution status on action reminders;
- helps the user get unstuck when work is not completed;
- replans without losing sight of the final outcome;
- learns how the user actually executes;
- continuously answers **"Am I on track?"** and **"What am I missing?"**

The product must feel like a calm, capable execution coach — not a project-management system.

---

# 2. Competitive Design Guardrails

Current products already cover important pieces of this problem:

| Product/category | What already exists | Vezriqen must not merely copy |
|---|---|---|
| Motion | AI task prioritization and automatic calendar scheduling using deadlines, priorities, and dependencies | "AI schedules my tasks" |
| Reclaim | Calendar-based automatic scheduling/rescheduling, habits, task completion modes, snooze/reschedule | "AI finds time and moves unfinished tasks" |
| Taskade | PDF/document import into structured projects and AI knowledge/context | "Upload a PDF and turn it into tasks" |
| Amazing Marvin | Goals, progress check-ins, planning, and many anti-procrastination strategies | "Goal tracker plus productivity techniques" |
| Fabulous | Habit stacking, routines, behavioral-science-oriented habit support | "Habit streaks and routines" |

## Vezriqen differentiation

Phase 1 must combine these behaviors in a way that is **outcome-aware rather than task-aware**:

1. **Plan ingestion with provenance** — understand the uploaded strategy, not only summarize it.
2. **Outcome model** — know what must become true for the goal to be achieved.
3. **Start-by intelligence** — distinguish a deadline from the date work should actually begin.
4. **Dependency intelligence** — recognize external people, approvals, documents, and prerequisites.
5. **Execution checkpoint loop** — important action reminders require the user to report what actually happened.
6. **Execution Block Coach** — "Not done" is a signal to solve the barrier, not merely move the task.
7. **Adaptive execution profile** — learn when, how, and in what size of work the individual succeeds.
8. **Rolling horizon planning** — translate a 3-year goal into a sensible 90-day / weekly / today plan without creating hundreds of tasks.
9. **Goal Health** — measure whether the outcome remains realistically achievable.
10. **What am I missing?** — continuously audit the plan and current state for gaps, not just overdue tasks.

**Competitive success test:** if the product can be described only as "Motion/Reclaim plus document upload," the implementation has missed the point.

---

# 3. Phase 1 Scope

## Included

- Responsive web application
- Google sign-in
- Optional Google Calendar connection with explicit consent
- Upload plan: PDF, DOCX, TXT/MD, JPG/PNG screenshots
- Paste plan text
- One or more goals per user; one goal may be marked Primary
- AI extraction and SMART confirmation
- Milestones, dependencies, tasks, success measures, constraints
- Rolling-horizon execution plan
- User-editable plan before activation
- Today screen
- Goal dashboard
- Goal Health
- "What am I missing?" audit
- Intelligent start-by dates and reminder lead times
- In-app reminder center
- Email reminders
- Reminder actions: Done, Partial, Not Done, Snooze, I'm Stuck, Waiting on Someone
- Execution Block Coach
- Adaptive replanning
- Execution Profile that learns from observed behavior
- Google Calendar read + creation/update of Vezri-created events
- Weekly plan review
- Basic activity/audit history
- User controls for reminder intensity and quiet hours

## Explicitly not Phase 1

- Native iOS/Android app
- SMS, WhatsApp, or phone calls
- Social/community feed
- Team project management
- Kanban boards, complex tags, Gantt charts, enterprise workflows
- Wearables or health-device integrations
- Autonomous emailing of third parties
- Autonomous editing/deleting of non-Vezri Google Calendar events
- Full general-purpose plan generation intended to replace ChatGPT/Claude/Gemini
- Human coach marketplace
- Gamification-heavy streaks, points, badges, leaderboards
- Medical, legal, financial, or mental-health diagnosis/treatment

---

# 4. Core UX Principles

1. **Under one minute to start.** A user should be able to sign in, upload/paste a plan, and see Vezri begin understanding it.
2. **Ask only what is missing.** Never ask the user to re-enter information already present in the document.
3. **AI proposes; user confirms.** The user retains control over goals, dates, major plan changes, and calendar writes.
4. **Goal-first, not task-first.** Always connect work to the desired outcome.
5. **Three important things beat 30 tasks.** The Today view should normally surface no more than three priority actions.
6. **No guilt.** Missed work triggers problem solving, not shame.
7. **Minimize configuration.** Infer reminder timing, task type, dependencies, and work windows where reasonable.
8. **Explain important decisions.** Example: "Start by Oct 10 because this requires another person's recommendation."
9. **Preserve source truth.** Show whether an item came from the uploaded plan or was inferred by Vezri.
10. **Progress is not task volume.** Completing low-value tasks must not make a goal appear healthier than it is.

---

# 5. Target User Journey

## Step 1 — Sign in
Primary: **Continue with Google**

After sign-in:
> "Connect Google Calendar so Vezri can plan around your real schedule?"

Calendar access is a separate permission and is not implied by Google authentication.

## Step 2 — Start a goal
Primary screen:

**What are you trying to achieve?**

- **Upload my plan**
- **Paste my plan**

Secondary:
- **I only have a goal**

For Phase 1, the best experience is document/paste-first. If a user only enters a goal, Vezri may create a lightweight starting structure or encourage the user to bring back a more detailed plan; it should not become a giant strategy-generation workflow.

## Step 3 — Vezri understands the plan
Show a short progress state:
- Reading the plan
- Finding the target
- Finding deadlines and dependencies
- Building the execution path

## Step 4 — Ask only critical missing questions
Maximum 1–3 questions per round.

Examples:
- "When do you want to achieve this?"
- "Have you already completed any of these milestones?"
- "How much time can you realistically spend per week?"

Do not expose a long SMART form.

## Step 5 — Confirm the target
Show one simple card:

**Your Target**
- Outcome
- Target date
- How success will be measured
- Important constraints

Buttons:
- **Looks right**
- **Adjust**

## Step 6 — Confirm the plan
Vezri shows:
- milestones;
- immediate priorities;
- major deadlines;
- dependencies;
- proposed start-by dates;
- near-term calendar blocks.

Button: **Start Goal**

## Step 7 — Execute
The app lands on **Today**, not a project tree.

---

# 6. SMART Goal Engine

Vezri uses SMART internally:
- Specific
- Measurable
- Achievable
- Relevant
- Time-bound

The user should not need to fill in five SMART fields.

### Requirements
- Extract the intended outcome from the plan.
- Detect missing success criteria and propose measurable criteria.
- Detect missing target date and ask for it when necessary.
- Flag clearly unrealistic time/capacity assumptions without claiming impossibility.
- Allow the user to override Vezri.
- Preserve both:
  - **user wording**; and
  - **normalized SMART target**.

### Example
User wording:
> "I want to follow my morning routine next week."

Vezri proposal:
> "Complete the agreed morning routine by 7:15 AM on at least 6 of the next 7 days."

---

# 7. Document / Plan Ingestion

## Supported input
- PDF
- DOCX
- TXT
- Markdown
- JPG/PNG screenshots
- Pasted text

Recommended Phase 1 limits:
- 25 MB per file
- 100 pages per document
- one primary plan document per goal, with optional supplemental documents

## Vezri extraction schema
For every plan, extract:
- primary desired outcome;
- target date(s);
- success measures;
- milestones;
- tasks/actions;
- hard deadlines;
- soft/preferred dates;
- dependencies;
- external-person dependencies;
- evidence/deliverables;
- recurring routines;
- estimated effort if stated;
- constraints;
- risks;
- already-completed items if stated;
- unknowns requiring clarification.

## Provenance requirement
Every extracted milestone/task/deadline must store:
- source document ID;
- source page/section when available;
- short source excerpt or anchor;
- `origin = explicit | inferred`;
- confidence score.

Vezri must never silently turn an inference into a document fact.

---

# 8. Planning Engine

The plan engine works backward from the outcome.

## Planning levels
For long goals, use a rolling horizon:

- **Destination** — final outcome
- **Major milestones** — months/quarters/years
- **Current 90 days** — meaningful near-term outcomes
- **This week** — actionable commitments
- **Today** — normally up to 3 priority actions

Do not create hundreds of dated tasks for a multi-year goal.

## Task properties
Each task may include:
- title
- milestone
- reason / outcome link
- estimated duration
- deadline
- Vezri start-by date
- priority
- dependency IDs
- task type
- recurrence
- reminder strategy
- calendar block
- status
- provenance
- user notes

---

# 9. Lead-Time Intelligence Engine

A deadline is **not** the same as the date work should begin.

Each action must be classified for lead-time logic.

## Initial task types
- routine/habit
- simple personal action
- deep work
- submission/application
- study/preparation
- external-person dependency
- approval/review
- purchase/reservation
- meeting/appointment
- multi-step project

## Inputs
- hard deadline;
- estimated effort;
- number/type of dependencies;
- involvement of another person;
- consequence of delay;
- user's available calendar time;
- user's execution profile;
- buffer appropriate to task type.

## Output
- **Deadline**
- **Start-by date**
- recommended prep reminder(s)
- recommended action checkpoint

### Example — recommendation letter
Application due: Nov 1  
Recommended:
- Oct 8: prepare résumé/brag sheet
- Oct 10: ask recommender
- Oct 20: check status
- Oct 27: polite reminder if needed

### Example — morning routine
Routine: 6:30 AM
- night before: preparation reminder if relevant
- 10 minutes before: action reminder
- after expected finish: completion checkpoint

Vezri should explain high-impact lead-time decisions in one sentence.

---

# 10. Execution Profile

Vezri should understand the person without requiring a personality questionnaire.

## Minimal onboarding
Ask at most:
1. **When are you usually most productive?** Morning / Afternoon / Evening / It varies
2. **How should Vezri remind you?** Early heads-up / Close to the task / Both
3. **How persistent should Vezri be?** Gentle / Balanced / Keep me accountable

Optional:
- quiet hours
- preferred work-block length

## Learned signals
Over time track:
- completion by time of day;
- reminder response rate;
- snooze frequency;
- actual vs estimated duration;
- completion by task size;
- deep-work success windows;
- how early the user tends to begin;
- external-dependency delay patterns;
- common Execution Block categories;
- effectiveness of prior interventions.

Do **not** label the user "lazy," "undisciplined," "procrastinator," etc.

Vezri quietly uses the profile to improve planning.

---

# 11. Google Calendar Integration

## Authentication
Google sign-in and Google Calendar permissions are separate consent steps.

## Read behavior
With permission, Vezri may use:
- busy/free periods;
- event start/end times;
- timezone;
- working constraints needed for scheduling.

## Write behavior
- Vezri may create calendar blocks only after the user confirms the plan or an individual proposed block.
- Vezri may update/reschedule **Vezri-created events** according to approved replanning rules.
- Vezri must never edit/delete a non-Vezri event.
- Calendar blocks must link back to the Vezri task.

## Capacity detection
Vezri should detect when planned effort exceeds realistic free time.

Example:
> "Your available time this week is about 7.5 hours, but the current plan needs about 10. I recommend keeping SAT prep and the scholarship deadline, and moving the lower-priority research task."

User approves any material tradeoff.

---

# 12. Reminder and Checkpoint Engine

## Two reminder types

### A. Heads-up
Informational. No response required.
Example:
> "Your recommendation request should go out tomorrow because the application is due in two weeks."

### B. Action checkpoint
Requires the user to close the loop.

Actions:
- **Done**
- **Partially done**
- **Not done**
- **Snooze**
- **I'm stuck**
- **Waiting on someone**

Every important task should eventually produce an action checkpoint.

## In-app reminders
- Today screen
- notification center
- contextual banner/card
- overdue checkpoint state

Browser push is not required in Phase 1.

## Email reminders
Email is used for:
- important start-by actions;
- morning/day plan;
- meaningful goal risk;
- weekly review;
- action checkpoints when the user is not active in the app.

Action email should provide secure deep links/buttons for:
- Done
- Snooze
- I'm stuck

Do not spam users with one email per low-value task.

## Unanswered checkpoint behavior
- Never assume completion.
- Mark state as `unconfirmed`.
- Send at most one reasonable follow-up before moving to a daily/weekly digest.
- Vezri may propose a new time but does not repeatedly nag.
- If the task becomes goal-critical, elevate it in Goal Health.

---

# 13. Execution Block Coach — Core Differentiator

When the user selects **Not done** or **I'm stuck**, Vezri should solve the execution barrier before simply rescheduling.

## Step 1 — One short question
> "What got in the way?"

Quick choices:
- Didn't have time
- Didn't know how to start
- It felt too big
- I kept avoiding it
- Waiting on someone
- Forgot
- My priorities changed
- Something else

## Step 2 — One useful intervention
Do not give a motivational essay.

### Intervention library
- shrink to a 5–15 minute first step;
- clarify the first concrete action;
- split the task;
- timebox;
- schedule in a better calendar window;
- remove or resolve a prerequisite;
- create a follow-up for another person;
- reduce scope while preserving the outcome;
- move lower-priority work;
- switch to an alternative action that advances the same milestone;
- ask the user for the missing information.

### Example — too big
Old task:
> Finish certification module 4

Vezri:
> "Let's shrink it. Open module 4 and complete the first 10 minutes. Want to do that at 7:30 PM?"

### Example — waiting on someone
> "This is not in your control right now. I'll suggest a Thursday follow-up and move you to the next task that does not depend on them."

### Example — no time
Use Calendar:
> "Today filled up. You have 40 minutes tomorrow at 5:15 PM. I recommend moving this there and postponing the lower-priority research task."

## Safety boundary
Vezri is an execution coach, not a mental-health clinician.
- It may support task initiation, motivation, overwhelm, prioritization, and practical barriers.
- It must not diagnose mental-health conditions.
- It must not present therapy or treatment as a substitute for professional help.
- For medical/legal/financial plans, Vezri executes the user's plan and may remind them to follow qualified professional guidance; it does not independently prescribe treatment, legal strategy, or financial actions.

---

# 14. Adaptive Replanning

A missed task should trigger an impact calculation.

Vezri asks:
1. Does this affect a dependency?
2. Does it threaten a milestone?
3. Is the final target date still achievable?
4. Is there enough calendar capacity to recover?
5. What is the smallest reasonable change?

## Replanning rules
- Minor schedule changes may be proposed quickly.
- Major commitments, deadline changes, scope reductions, or priority tradeoffs require confirmation.
- Never silently change the user's final goal.
- Explain the consequence in plain language.

Example:
> "You are about 3.5 study hours behind, but the certification date is still achievable. I recommend +30 minutes Thursday, +60 minutes Saturday, and dropping the optional chapter review."

Buttons:
- **Approve**
- **Adjust**
- **Keep original plan**

---

# 15. Goal Health

Goal Health must be more than percent of tasks completed.

## Statuses
- **On Track**
- **Needs Attention**
- **At Risk**
- **Off Track**
- **Achieved**

## Hybrid calculation
Use deterministic factors for the score/status:
- milestone completion;
- critical-path delays;
- deadline proximity;
- missing dependencies;
- available time vs required effort;
- missed high-impact checkpoints;
- success-measure progress;
- required evidence/deliverables.

AI may explain the score but should not invent it.

## Goal Health card
Example:

**Certification — Needs Attention**

- Study modules: On track
- Practice tests: Behind
- Calendar capacity: Sufficient
- Exam registration: Missing

**Vezri recommends:** Register for the exam this week because it is now the highest-risk dependency.

---

# 16. "What Am I Missing?" Audit

A visible button on every goal:

## What am I missing?

Vezri audits:
- uploaded plan requirements;
- milestones;
- dependencies;
- required evidence;
- deadlines;
- calendar capacity;
- unanswered checkpoints;
- unresolved Execution Blocks;
- progress against success measures.

Return no more than:
- top 3 gaps;
- why each matters;
- the single highest-value next move.

Example:
> "Your participant reach is ahead, but independent validation is behind. Your highest-value next move is obtaining one written partner verification before adding more media outreach."

This feature must distinguish **missing requirements** from merely **unfinished tasks**.

---

# 17. Today Screen

The default home screen after onboarding.

## Required layout

**Good morning, [Name]**

### Your most important moves today
Normally 1–3 cards.

Each card shows:
- goal;
- action;
- why it matters;
- estimated time;
- scheduled time if applicable;
- Start / Done / Snooze / Stuck.

Below:
- goal health summaries;
- upcoming critical deadlines;
- notification center.

Do not default to a giant backlog.

---

# 18. Goal Dashboard

Each goal page includes:
- target card;
- Goal Health;
- progress by milestone;
- next 3 actions;
- critical dates;
- active dependencies;
- "What am I missing?";
- recent Vezri recommendation;
- plan/document source;
- activity history.

Optional expandable sections:
- full plan;
- calendar;
- evidence/deliverables;
- history.

---

# 19. Weekly Review

Once per week, Vezri prepares a short review:

1. What moved forward?
2. What slipped?
3. What did Vezri learn about the user's execution pattern?
4. Is the goal still achievable on the current plan?
5. What are next week's 1–3 most important outcomes?
6. Does the plan need adjustment?

User can approve the revised week in one action.

---

# 20. AI Behavior Requirements

Vezri should be:
- concise;
- calm;
- practical;
- non-judgmental;
- specific;
- action-oriented;
- honest about uncertainty.

## Required AI rules
- Ask only high-value questions.
- Never invent a deadline from an uploaded document.
- Clearly label inferred items.
- Prefer one next action over a long lecture.
- Use the user's actual plan and history before giving generic advice.
- Do not overwhelm the user with every possible optimization.
- Do not alter major goals/commitments without confirmation.
- Use structured output for extraction, planning, audits, and replans.
- Save a short explanation/reason for major AI decisions.
- If a low-confidence extraction materially affects the plan, ask the user.

---

# 21. Suggested Data Model

## User
- id
- name
- email
- timezone
- primary_goal_id
- reminder_style
- accountability_level
- quiet_hours
- created_at

## ExecutionProfile
- user_id
- productive_windows
- preferred_block_minutes
- completion_by_time
- snooze_patterns
- estimate_accuracy
- common_blocks
- effective_interventions
- profile_confidence
- updated_at

## Goal
- id
- user_id
- user_goal_text
- normalized_goal
- target_date
- success_criteria
- status
- health_score
- health_status
- primary_flag
- activated_at

## PlanDocument
- id
- goal_id
- filename
- mime_type
- storage_url
- extracted_text
- parse_status
- created_at

## PlanSourceAnchor
- id
- document_id
- page_or_section
- excerpt
- location_metadata

## Milestone
- id
- goal_id
- title
- target_date
- status
- weight
- source_anchor_id
- origin
- confidence

## Task
- id
- goal_id
- milestone_id
- title
- rationale
- task_type
- estimated_minutes
- deadline
- start_by
- priority
- status
- recurrence_rule
- source_anchor_id
- origin
- confidence

## TaskDependency
- task_id
- depends_on_task_id
- dependency_type
- external_party_name_optional

## Reminder
- id
- task_id
- type
- channel
- scheduled_at
- response_required
- sent_at
- response

## CheckIn
- id
- task_id
- state
- note
- created_at

## ExecutionBlock
- id
- task_id
- category
- user_text
- intervention_type
- recommendation
- accepted
- created_at

## CalendarConnection
- user_id
- provider
- scopes
- token_reference
- connected_at

## CalendarBlock
- task_id
- provider_event_id
- start
- end
- vezri_created

## GoalAudit
- id
- goal_id
- health_inputs_json
- health_result
- missing_items_json
- created_at

## AIActionLog
- id
- user_id
- goal_id
- action_type
- structured_input
- structured_output
- explanation
- model_version
- created_at

---

# 22. Suggested Technical Architecture

If this is a greenfield build, recommended defaults:

- **Frontend:** Next.js + TypeScript
- **UI:** responsive web app, accessible component library
- **Backend:** Next.js server routes/actions or a small API service
- **Database:** PostgreSQL
- **Auth:** Google OAuth
- **Storage:** object storage for uploaded plans
- **AI:** provider abstraction; structured JSON output validated with schemas
- **Document parsing:** server-side PDF/DOCX/text extraction; multimodal model for screenshots/images
- **Background jobs:** durable scheduled job system for reminders, weekly audits, and email delivery
- **Email:** transactional provider such as Resend/Postmark
- **Calendar:** Google Calendar API
- **Observability:** structured logs + error tracking
- **Analytics:** product events focused on activation, reminder response, recovery, and goal progress

If an existing repository uses a different reasonable stack, preserve it unless changing the stack is necessary.

---

# 23. Security, Privacy, and Trust

- Request minimum Google scopes necessary.
- Separate Google sign-in from Calendar consent.
- Encrypt tokens/secrets at rest.
- Never expose provider refresh tokens to the browser.
- Users can disconnect Calendar.
- Users can delete an uploaded document and its derived content.
- Vezri never edits non-Vezri calendar events.
- Sensitive documents must not be used to train a public model unless the user explicitly opts in and product policy permits it.
- Validate file types and scan/limit uploads.
- Secure email action links with short-lived signed tokens.
- Log major plan modifications.
- Provide "Why did Vezri suggest this?" for high-impact recommendations.
- Avoid manipulative guilt/shame notification language.

---

# 24. Key Product Metrics

Phase 1 should track:

## Activation
- % of sign-ups who upload/paste a plan
- % who confirm a SMART target
- % who activate a goal
- median time from sign-in to activated goal

Target design goal: **first useful plan in under 2 minutes** for a clear uploaded document.

## Execution
- action-checkpoint response rate
- Done / Partial / Not Done / Snooze / Stuck distribution
- reminder-to-completion conversion
- calendar-block completion confirmation

## Differentiation metrics
- **Recovery rate:** % of Not Done/Stuck events returned to a viable plan within 48 hours
- **Intervention success:** % of accepted Vezri interventions followed by completion
- **Plan risk detection:** number of material missing dependencies identified before deadline
- **What Am I Missing usage:** % of active users who use the audit
- **Start-by effectiveness:** completion rate of dependency-heavy tasks before hard deadline

## Goal outcome
- milestone completion rate
- goal completion/achievement rate
- Goal Health trend
- self-reported usefulness of Vezri's next-action recommendations

Do not optimize for number of tasks created.

---

# 25. Core Acceptance Tests

## A. Seven-day routine
Given an uploaded plan for a 7-day morning routine:
- Vezri extracts the routine and success target.
- It proposes a measurable 7-day target.
- It creates night-before prep when appropriate and morning action checkpoints.
- User can report Done/Partial/Not Done/Snooze/Stuck.
- A missed morning does not automatically fail the goal.
- Vezri proposes the smallest recovery plan.

## B. Recommendation letter
Given an application deadline and recommendation requirement:
- Vezri recognizes an external-person dependency.
- It proposes a start-by date well before the hard deadline.
- It creates preparation, request, and follow-up actions.
- If user says "Waiting on someone," Vezri advances other independent work.

## C. Certification
Given an exam date and study plan:
- Vezri calculates weekly required effort.
- It schedules around Calendar availability.
- After missed sessions, it recalculates whether the target remains achievable.
- It proposes a recovery plan rather than blindly stacking missed hours.

## D. Three-year company goal
Given a detailed 3-year plan:
- Vezri preserves long-term milestones.
- It does not create hundreds of dated tasks.
- It creates a rolling near-term execution horizon.
- Today shows only the highest-value next actions.
- Quarterly/90-day planning can refresh without rewriting the final target.

## E. Complex uploaded strategy document
Given a long multi-section strategy:
- Vezri extracts deadlines, milestones, dependencies, evidence requirements, and risks.
- Every extracted item has provenance.
- "What am I missing?" can identify a missing requirement that is not simply an overdue task.
- Low-confidence high-impact interpretations require confirmation.

---

# 26. Phase 1 Definition of Done

Phase 1 is done when a new user can:

1. Sign in with Google.
2. Optionally connect Google Calendar.
3. Upload or paste an externally created plan.
4. Receive a correct, concise target summary.
5. Answer no more than a few missing-information questions.
6. Confirm a SMART goal and Vezri-generated execution plan.
7. See a simple Today view with up to 3 priority actions.
8. Receive in-app and email reminders with sensible lead time.
9. Tell Vezri what actually happened.
10. Select Not Done or I'm Stuck and receive a useful, specific execution intervention.
11. Approve a replan that preserves the final goal.
12. See Goal Health.
13. Ask "What am I missing?" and receive a useful audit.
14. Have Vezri learn at least basic reminder/scheduling preferences from behavior.
15. Complete the loop without needing to manually maintain a traditional project-management system.

---

# 27. Open Decisions — Recommended Defaults

These should not block Phase 1 development unless implementation requires them.

| Decision | Recommended default |
|---|---|
| Multiple goals | Yes; one Primary goal |
| First-run entry | Upload/Paste plan first |
| Goal-only entry | Supported, lightweight |
| Calendar connection | Optional but prominently offered |
| Calendar write | Only Vezri-created blocks, user-approved |
| Web reminders | In-app; no browser push required |
| Email cadence | Intelligent; critical actions + digest, not spam |
| Action response | Required for important checkpoints |
| No response | Unconfirmed, never assumed complete |
| Snooze | User options + Vezri recommended time |
| Long goals | Rolling 90-day / weekly horizon |
| Replanning | AI proposes; user approves material changes |
| Tone | Calm, concise, non-judgmental |
| Pricing | Out of scope for Phase 1 PRD |
| LLM vendor | Provider-agnostic |

---

# 28. Product North Star

When a user opens Vezriqen, the product should continuously answer four questions:

1. **What am I trying to achieve?**
2. **What matters most right now?**
3. **Am I still on track?**
4. **If I'm stuck or falling behind, what is the smallest useful way forward?**

The simplest statement of the product:

> **Upload your plan. Vezri keeps you moving toward the outcome.**

Possible brand line:

> **Aim. Adjust. Achieve.**

---

# 29. Research References Used for Competitive Guardrails

- Motion — AI Task Manager: https://www.usemotion.com/features/ai-task-manager
- Reclaim — automatic schedule management: https://help.reclaim.ai/en/articles/6207587-how-reclaim-manages-your-schedule-automatically
- Reclaim — task/habit completion and auto-rescheduling: https://help.reclaim.ai/en/articles/6937489-auto-rescheduling-settings-for-tasks-and-habits
- Taskade — PDF import / convert to structured project: https://www.taskade.com/learn/import/pdf
- Amazing Marvin — Goals & Objectives: https://help.amazingmarvin.com/en/articles/5015479-goals-objectives
- Amazing Marvin — productivity/procrastination strategies: https://help.amazingmarvin.com/en/collections/1139197-strategies
- Fabulous — routines, habits, and habit stacking: https://help.thefabulous.co/en/support/solutions/articles/101000427095-what-s-the-difference-between-routines-and-habits-

---

# 30. Public Website UI Implementation Requirements

## 30.1 Source-of-truth order

The coding agent must implement the public website without asking the user routine design questions. Resolve ambiguity in this order:

1. This PRD.
2. The attached Vezriqen AI™ UI mockup supplied with the build request.
3. Existing Calyqen AI™ components/modules when the user explicitly asks to reuse them.
4. The defaults in this section.

Only ask the user if development is genuinely blocked by an external credential, unavailable repository/resource, or a legal/business fact that cannot safely be inferred. Do **not** ask about spacing, button placement, colors, page structure, copy hierarchy, route naming, responsive behavior, or other normal implementation choices covered here.

The attached UI mockup is a **visual reference**, not permission to preserve any text or navigation item that conflicts with this PRD.

## 30.2 Branding requirements

- Display the product name as **Vezriqen AI™** everywhere in public-facing product branding, page titles, headers, footers, metadata, and legal-page product references.
- The mascot may be called **Vezri** by itself.
- Never display the public brand merely as “Vezriqen” when the full product name is intended.
- Brand line: **Aim. Adjust. Achieve.**
- Vezri is the supplied dusty-rose/blush falcon archer mascot. Reuse the supplied mascot asset; do not regenerate or substitute an owl/bird illustration.
- Primary palette (Palette A):
  - Dusty rose: `#C98F9D`
  - Blush: `#E8C1C8`
  - Mauve-brown: `#76545D`
  - Warm cream: `#F5E8D7`
  - Champagne gold: `#C9A15C`
- Use white/cream as the dominant canvas. Color should feel soft and premium, not saturated.
- Use generous whitespace, rounded controls, subtle borders/shadows, and short copy blocks similar in cleanliness to Calyqen AI™ and Meriqen AI™.
- Avoid dense gradients, heavy animation, dark full-screen sections, carousels, autoplay media, or text-heavy marketing sections.

## 30.3 Conversion objective

The website's primary objective is **free-account creation**.

Primary CTA text everywhere: **Sign Up Free**

Support text near the main CTA:
> **Free to use · no credit card · start in under a minute**

CTA hierarchy:
- Primary: Sign Up Free
- Secondary: Sign In
- Tertiary text links: How It Works, My Story ♥, Privacy

Requirements:
- Put **Sign Up Free** in the header, hero, and final CTA section.
- Do not add a Pricing navigation item in Phase 1.
- Do not add a Contact navigation item.
- Do not create competing primary CTAs such as “Learn More,” “Book a Demo,” or “Get Started” when Sign Up Free is appropriate.
- Clicking Sign Up Free should go directly to the existing/reused sign-up flow, not another marketing page.

## 30.4 Global header

Desktop order:

**Vezriqen AI™ logo/wordmark** | How It Works | My Story ♥ | Privacy | Sign In | **Sign Up Free**

Behavior:
- Logo returns to `/`.
- `How It Works` scrolls to the on-page feature/how-it-works section on the homepage.
- `My Story ♥` routes to `/about` for consistency with Calyqen AI™ patterns.
- `Privacy` routes to `/privacy`.
- Sign In routes to the existing auth/sign-in flow.
- Sign Up Free routes to the existing auth/sign-up flow.
- On mobile, collapse navigation into a simple menu while keeping **Sign Up Free** visually prominent.
- The heart is part of the visible label: **My Story ♥**.

## 30.5 Homepage `/`

### Hero

Eyebrow:
> **YOUR GOALS. A SMARTER WAY.**

Headline:
> **Turn Your Plans Into Progress.**

Support copy:
> **Upload your plan. Vezri helps you follow it, adjust when life happens, and achieve your goals.**

Primary CTA:
> **Sign Up Free →**

CTA support:
> **Free to use · no credit card · start in under a minute**

Visual:
- Place the supplied Vezri falcon archer prominently to the right on desktop and below the copy on mobile.
- Keep the mountain/target/path motif subtle; the mascot must remain the focal visual.
- Do not crowd the hero with screenshots or extra paragraphs.

### How It Works / Features — on the homepage, not a separate page

Anchor ID: `how-it-works`

Show four concise cards/columns:

1. **Upload Your Plan**  
   Share your plan (PDF, Word, image, or text) and turn it into simple steps.

2. **Smart Scheduling**  
   Vezri works with your calendar to find the right time and starts important work early enough.

3. **Stay On Track**  
   Context-aware reminders, check-ins, and flexible adjustments when life changes.

4. **Get Unstuck**  
   If you do not complete a task, Vezri helps identify what got in the way and finds the smallest useful way forward.

Keep each description to roughly 1–2 short lines on desktop. Use simple line icons; do not create a separate Features route/page.

### Product preview / progress section

Headline:
> **Progress Feels Good.**

Support copy:
> **See what matters today, check off what you completed, and keep moving forward — one step at a time.**

Use a clean product-preview panel showing only a few items, for example:
- Good morning, Nikita
- Your plan for today
- 2–3 task/checkpoint rows
- a small Goal Health indicator
- an **Ask Vezri** / **I'm Stuck** affordance

The preview is illustrative; actual authenticated product UI is governed by the product requirements earlier in this PRD.

### Final CTA

Headline:
> **Ready to Turn Your Plan Into Progress?**

Support:
> **Join Vezriqen AI™ and start today — for free.**

Button:
> **Sign Up Free →**

Support text:
> **Free to use · no credit card · start in under a minute**

## 30.6 My Story page `/about`

The navigation label is always **My Story ♥**.

Page eyebrow:
> **A REAL STUDENT. A REAL PROBLEM. A BIGGER PURPOSE.**

Headline:
> **Why I Built Vezriqen AI™**

Subhead:
> **Sometimes a personal challenge can lead to something bigger.**

Story should be short, first-person, warm, and clearly tied to SAT preparation. Use this approved narrative as the baseline copy:

> I created Vezriqen AI™ while I was preparing for the SAT.
>
> I had a detailed study plan, but I kept falling behind. Some days I didn't know how to start. Other days school and life got busy. A reminder could tell me what I missed, but it didn't help me understand why — or what to do next.
>
> **I wanted something that understood me, helped me get unstuck, and kept me moving.**
>
> So I built Vezriqen AI™.
>
> Now, Vezri helps people turn plans into real progress — whether the goal is an exam, a certification, a healthier routine, or a long-term dream like starting a company.
>
> Because having a plan is just the beginning. You deserve a partner that helps you follow through.
>
> **— Nikita Tejwani**  
> Founder, Vezriqen AI™

Visual requirements:
- Use a real, user-approved founder image if one is supplied or already available in the Calyqen AI™ project assets. Do not generate a fake founder portrait.
- Keep the heart motif subtle and consistent with `My Story ♥` on Calyqen AI™.
- A small Vezri mascot appearance is welcome near the final CTA, but the founder story should remain central.

Final CTA:
> **Have a goal ready? Let's make it happen.**
>
> **Sign Up Free →**

## 30.7 Authentication UI

Do not invent a new auth experience if the Calyqen AI™ authentication module is available. Reuse/adapt that module so behavior is familiar and development is faster.

Required behavior:
- **Continue with Google** is prominent.
- Existing email/password sign-up may remain if already supported by the reused auth module.
- Brand every auth screen as **Vezriqen AI™**.
- After Google authentication, Calendar permission is a separate optional consent step; Google sign-in itself must not silently grant Calendar access.
- Successful first signup should flow directly into Vezriqen onboarding: **Upload your plan / Paste your plan**.

## 30.8 Privacy, Terms, and Feedback — reuse, do not redesign

The coding agent should inspect the existing Calyqen AI™ implementation and **reuse the existing legal/feedback page components and interaction patterns** rather than redesigning these pages from the mockup.

Routes required:
- `/privacy`
- `/terms`
- `/feedback`

There is **no separate Contact page or Contact navigation item**. The Feedback page is the user-facing support/contact path.

Important: reuse the module/visual structure, **not Calyqen-specific legal wording without review**. Vezriqen AI™ processes different data and permissions, including uploaded goal/plan documents, execution history, reminders, and optional Google Calendar data. The Vezriqen legal text must be product-specific and must accurately describe the final implementation and providers/scopes used.

Implementation defaults:
- Preserve the clean Calyqen legal-page layout and back-navigation pattern.
- Reuse the Calyqen feedback module if available, including authentication behavior and submission plumbing.
- Replace Calyqen product names/assets with **Vezriqen AI™** and Vezri assets.
- Do not introduce a generic contact form in addition to Feedback.
- Do not invent a new legal owner. If the Vezriqen project shares the existing Calyqen legal entity/configuration, use that configured owner; otherwise keep the owner as a configuration value rather than fabricating one.

## 30.9 Footer

Keep the footer small and quiet.

Required links:
- My Story ♥
- Privacy
- Terms
- Feedback

Do not include Contact.

Brand line must use **Vezriqen AI™**.

If a copyright/legal-owner string already exists in the shared Calyqen module, reuse its configured legal entity only if it applies to Vezriqen AI™. Do not hardcode an unverified owner.

## 30.10 Responsive requirements

- Desktop design reference: approximately 1440px wide.
- Must work cleanly at 375px mobile width without horizontal scrolling.
- Hero becomes one column on mobile; copy first, Vezri second.
- Feature cards stack 1-column on narrow mobile and may use 2-column at tablet widths.
- CTA buttons remain large enough for touch use.
- Headline wrapping must be intentional; do not allow orphaned single words where avoidable.
- Keep body copy readable; do not shrink text to preserve desktop composition.

## 30.11 Accessibility and performance

- Semantic headings in logical order.
- Keyboard-accessible navigation and forms.
- Visible focus states.
- Meaningful alt text for Vezri and founder images.
- Decorative images use empty alt text.
- Color contrast must remain accessible even with the soft pink palette.
- Respect `prefers-reduced-motion`.
- Optimize supplied mascot/founder assets; use modern image formats where appropriate.
- Avoid loading large decorative assets above the fold if they materially delay first render.

## 30.12 Metadata / SEO defaults

Homepage title:
> **Vezriqen AI™ — Turn Your Plans Into Progress**

Homepage description:
> **Upload your plan. Vezri helps you stay on track, get unstuck, and keep moving toward your goal. Sign up free.**

My Story title:
> **My Story ♥ — Why I Built Vezriqen AI™**

Do not keyword-stuff. The primary conversion action remains Sign Up Free.

## 30.13 UI acceptance criteria

The public UI is complete only when all of the following are true:

- The header/footer/product metadata consistently say **Vezriqen AI™**.
- `My Story ♥` visibly includes the heart.
- There is no Contact navigation/page.
- There is no standalone Features page; features/how-it-works content is on `/`.
- There is no Pricing item in Phase 1 navigation.
- Sign Up Free appears in header, hero, and final CTA.
- The homepage has materially less text than a typical SaaS landing page and remains scannable in under 20 seconds.
- Vezri uses the supplied dusty-rose falcon asset and is not recreated as a different bird.
- `/about` contains the SAT-origin story and a signup CTA.
- Privacy/Terms/Feedback reuse the existing Calyqen module/pattern when available rather than receiving a new bespoke design.
- Feedback serves as the support/contact route.
- Auth can reuse the Calyqen module and first signup flows into plan upload/paste onboarding.
- Mobile and desktop layouts both pass visual QA.
- All CTAs and route links work end to end.

---

# 31. No-Question Build Defaults for Coding Agents

When instructed to build from this PRD plus the attached UI mockup, the coding agent should proceed autonomously using these defaults instead of asking routine questions:

- Use the existing project stack if a repository is provided; otherwise use the greenfield stack in Section 22.
- Reuse Calyqen AI™ auth, legal, and feedback components if they are available to the repository/user.
- Use the attached UI mockup for composition and the supplied Vezri asset for the mascot.
- Implement homepage and My Story first, then authentication/onboarding integration, then legal/feedback reuse.
- Use responsive CSS and reusable components; do not hardcode only the screenshot's dimensions.
- Use the exact public copy in this section unless minor line-break changes are required for responsiveness.
- Do not create pages/features that the PRD excludes.
- Use placeholders/configuration for external secrets and OAuth credentials, and document required environment variables in `.env.example`.
- Add basic automated tests for public routes, CTA links, auth redirects, and absence of the removed Contact/Features/Pricing navigation items.
- Run lint/typecheck/tests/build before declaring the website complete.
- Provide a final implementation summary listing routes created/reused, environment variables required, tests run, and any true blockers that remain.

