import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BLOCK_CATEGORIES,
  COACH_SYSTEM,
  INTERVENTIONS_FOR,
  INTERVENTION_TYPES,
  InterventionSchema,
  RETIRED_INTERVENTION_TYPES,
  coachPrompt,
  fallbackIntervention,
  type BlockCategory,
} from "@/lib/coach/interventions";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import { calculateImpact, isSafeReplan, type Replan } from "@/lib/coach/replan";
import { bestWindow, rankEffectiveInterventions, windowForHour } from "@/lib/coach/profile";
import { BLOCK_CHOICES } from "@/lib/app-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/** Prompts are hard-wrapped for reading; assertions are about the words. */
const unwrapped = (prompt: string) => prompt.replace(/\s+/g, " ");

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;|&rsquo;/g, "'")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * PRD §13 is the product's core differentiator, and its whole claim rests on
 * one behaviour: "'Not done' is a signal to solve the barrier, not merely move
 * the task." These tests exist to make regressing to a bare reschedule fail.
 */
describe("Execution Block Coach (PRD §13)", () => {
  it("offers the eight quick choices §13 lists", () => {
    expect(BLOCK_CHOICES).toHaveLength(8);
    expect(BLOCK_CHOICES.map((c) => c.id).sort()).toEqual([...BLOCK_CATEGORIES].sort());
  });

  it("has at least one intervention for every barrier", () => {
    for (const category of BLOCK_CATEGORIES) {
      expect(INTERVENTIONS_FOR[category].length).toBeGreaterThan(0);
    }
  });

  // The central assertion. Avoidance and overwhelm are not clock problems, and
  // giving them a later date is the failure §13 was written against.
  it("never offers rescheduling as a way out of avoidance or overwhelm", () => {
    for (const category of ["felt_too_big", "kept_avoiding", "didnt_know_how_to_start"] as const) {
      expect(
        INTERVENTIONS_FOR[category],
        `${category} must not be answered with a reschedule`,
      ).not.toContain("reschedule_window");
    }
  });

  it("reaches for a smaller first step when the task felt too big", () => {
    expect(INTERVENTIONS_FOR.felt_too_big[0]).toBe("shrink_first_step");
  });

  it("answers a genuine time problem with time-shaped interventions", () => {
    expect(INTERVENTIONS_FOR.no_time).toContain("timebox");
    expect(INTERVENTIONS_FOR.no_time).toContain("reschedule_window");
  });

  // §13's worked example: "This is not in your control right now."
  it("moves the user onward when they are waiting on someone", () => {
    expect(INTERVENTIONS_FOR.waiting_on_someone).toContain("follow_up_other_person");
    expect(INTERVENTIONS_FOR.waiting_on_someone).toContain("alternative_action");
  });

  it("never proposes a bare reschedule for work blocked on another person", () => {
    expect(INTERVENTIONS_FOR.waiting_on_someone).not.toContain("reschedule_window");
  });
});

describe("coaching without the model (PRD §13 must still work)", () => {
  it("produces a concrete intervention for every barrier", () => {
    for (const category of BLOCK_CATEGORIES) {
      const intervention = fallbackIntervention(category as BlockCategory, "Finish module 4", null);
      expect(intervention.message.length).toBeGreaterThan(0);
      expect(INTERVENTIONS_FOR[category as BlockCategory]).toContain(
        intervention.intervention_type,
      );
    }
  });

  it("shrinks the task rather than moving it when it felt too big", () => {
    const intervention = fallbackIntervention("felt_too_big", "Finish module 4", null);
    expect(intervention.intervention_type).toBe("shrink_first_step");
    expect(intervention.proposal.new_task_minutes).toBeLessThanOrEqual(15);
    expect(intervention.proposal.new_task_title).toContain("Finish module 4");
  });

  it("creates a follow-up naming the person when blocked on someone", () => {
    const intervention = fallbackIntervention(
      "waiting_on_someone",
      "Recommendation letter",
      "Ms. Alvarez",
    );
    expect(intervention.intervention_type).toBe("follow_up_other_person");
    expect(intervention.proposal.follow_up_with).toBe("Ms. Alvarez");
    expect(intervention.message).toContain("isn't in your control");
  });

  // §10 and §13 both forbid characterising the user.
  it("never uses guilt or character language", () => {
    const forbidden = /lazy|undisciplined|procrastinat|should have|failed|excuse|discipline/i;
    for (const category of BLOCK_CATEGORIES) {
      const intervention = fallbackIntervention(category as BlockCategory, "A task", "Sam");
      expect(intervention.message, `${category}: "${intervention.message}"`).not.toMatch(forbidden);
    }
  });
});

describe("the panel asks once, and one chip is the whole answer", () => {
  const markup = html(
    <ExecutionBlockCoach taskId="t1" taskTitle="Finish module 4" onDone={() => {}} />,
  );

  it("asks the one question §13 asks", () => {
    expect(text(markup)).toContain("What got in the way?");
    // The eight choices plus one submit. No ninth chip, no text box.
    expect(markup.match(/<button/g)).toHaveLength(BLOCK_CATEGORIES.length + 1);
  });

  /**
   * The free-text box is gone, for the same reason it went from StuckPanel.
   *
   * "Anything else? (optional)" sat under the chips, before anything had been
   * picked, with no sign that picking was required — and it said the same
   * thing as the "Something else" chip in a vaguer way. People typed into it
   * and nothing happened, because the chips were the submit and none had been
   * clicked.
   */
  it("offers no free-text box, and no second way to say Something else", () => {
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<textarea");
    expect(text(markup)).not.toContain("Anything else?");
    // The chip that covers the case is still there, and is the only one.
    expect(text(markup)).toContain("Something else");
  });

  it("disables the submit until a chip is picked, and says why", () => {
    // The affordance the text box never gave. `disabled` rather than a click
    // that shows an error: a control that can do nothing should look like it.
    const submit = markup.slice(markup.lastIndexOf("<button"));
    expect(submit).toContain("disabled");
    expect(text(markup)).toContain("Pick one to carry on.");
  });

  it("makes the selected chip readable without relying on colour", () => {
    // Single-select, so every chip carries its state for a screen reader.
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(BLOCK_CATEGORIES.length);
  });

  it("sends no user_text, because there is nothing left to type it into", () => {
    const panel = readFileSync("src/components/coach/ExecutionBlockCoach.tsx", "utf8");
    expect(panel).not.toContain("user_text");
    const route = readFileSync("src/app/api/tasks/[id]/block/route.ts", "utf8");
    const schema = route.slice(
      route.indexOf("const BlockSchema"),
      route.indexOf("export async function"),
    );
    expect(schema).not.toMatch(/user_text/);
  });
});

describe("what the coach is told once the free text is gone", () => {
  it("no longer asks the model to weigh text that cannot exist", () => {
    expect(COACH_SYSTEM).not.toMatch(/what they typed|in their words|has told you/i);
    expect(unwrapped(COACH_SYSTEM)).toContain("there is no free text");
  });

  /**
   * The panel has two buttons and no field. A question back from the coach is
   * a dead end — the user can only accept or decline it, and neither answers
   * it. This is the prompt-side half of retiring "ask_user": the type is gone,
   * and the instruction stops the same shape coming back in prose.
   */
  it("forbids asking a question the panel cannot take an answer to", () => {
    expect(unwrapped(COACH_SYSTEM)).toContain("Never ask the user a question");
  });

  it("tells the model what to do when the barrier is Something else", () => {
    const guidance = unwrapped(COACH_SYSTEM);
    expect(guidance).toContain('If what got in the way was "Something else"');
    // The rule that matters: an unknown barrier is not licence to invent one.
    expect(guidance).toMatch(/must not invent|do not guess at a feeling/i);
    expect(guidance).toContain("Work from the task instead");
  });

  it("builds a prompt that never references typed text", () => {
    const prompt = coachPrompt({
      taskTitle: "Finish module 4",
      taskType: "deep_work",
      estimatedMinutes: 90,
      deadline: null,
      goalTitle: "Pass the exam",
      category: "something_else",
      categoryLabel: "Something else",
      externalParty: null,
      allowedInterventions: INTERVENTIONS_FOR.something_else,
      previouslyEffective: [],
      productiveWindow: "morning",
    });
    expect(prompt).toContain("What got in the way: Something else");
    expect(prompt).not.toMatch(/their words|they typed/i);
    // The task is what is left to reason from, so it has to all be there.
    expect(prompt).toContain("Finish module 4");
    expect(prompt).toContain("deep_work");
    expect(prompt).toContain("90 minutes");
  });

  // Offline, "Something else" used to come back as "What would the very first
  // action be?" — a question under two buttons, neither of which answers it.
  it("answers an unknown barrier with an action rather than a question", () => {
    const intervention = fallbackIntervention("something_else", "Finish module 4", null);
    expect(intervention.message).not.toContain("?");
    expect(intervention.proposal.new_task_title).toContain("Finish module 4");
    expect(INTERVENTIONS_FOR.something_else).toContain(intervention.intervention_type);
  });
});

/**
 * A panel that cannot take an answer must not be able to ask a question.
 *
 * "ask_user" invited a reply, and neither panel that shows an intervention has
 * anywhere to put one: the coach offers "Let's do that" and "Not this time",
 * and the "I'm stuck" panel offers an action, a split and a move. Leaving it on
 * a single barrier only meant it fired eventually, so it is retired outright.
 */
describe("the intervention nobody could answer", () => {
  it("is gone from the types the product can produce", () => {
    expect(INTERVENTION_TYPES).not.toContain("ask_user");
    expect(RETIRED_INTERVENTION_TYPES).toContain("ask_user");
  });

  it("is offered for no barrier at all, not merely for the vague one", () => {
    for (const category of BLOCK_CATEGORIES) {
      for (const retired of RETIRED_INTERVENTION_TYPES) {
        expect(
          INTERVENTIONS_FOR[category as BlockCategory] as readonly string[],
          `${category} must not offer the retired ${retired}`,
        ).not.toContain(retired);
      }
    }
  });

  it("cannot come back through the model either", () => {
    // The schema is what the model's output is validated against, so a
    // retired type is unreturnable rather than merely unasked-for.
    const answer = {
      intervention_type: "ask_user",
      message: "What would the first step be?",
      proposal: {
        new_task_title: null,
        new_task_minutes: null,
        suggested_start: null,
        revised_title: null,
        follow_up_with: null,
      },
      reasoning: "",
    };
    expect(InterventionSchema.safeParse(answer).success).toBe(false);
    expect(
      InterventionSchema.safeParse({ ...answer, intervention_type: "shrink_first_step" }).success,
    ).toBe(true);
  });

  it("never reappears as something that worked for this person before", () => {
    // execution_blocks keeps every intervention ever offered, retired ones
    // included, and §10 reads that history back into the prompt. A retired
    // type surfacing there would recommend what nothing can choose.
    const ranked = rankEffectiveInterventions({
      effective_interventions: {
        ask_user: { accepted: 5, offered: 5 },
        shrink_first_step: { accepted: 2, offered: 4 },
      },
    });
    expect(ranked).not.toContain("ask_user");
    expect(ranked).toContain("shrink_first_step");
  });

  it("keeps the live list and the retired list disjoint", () => {
    for (const retired of RETIRED_INTERVENTION_TYPES) {
      expect(INTERVENTION_TYPES as readonly string[]).not.toContain(retired);
    }
  });
});

describe("adaptive replanning (PRD §14)", () => {
  const NOW = new Date("2027-03-01T00:00:00.000Z");

  function impactInputs(overrides: Partial<Parameters<typeof calculateImpact>[0]> = {}) {
    return {
      now: NOW,
      targetDate: new Date("2027-09-01T00:00:00.000Z"),
      missedTask: {
        title: "Practice test 2",
        deadline: new Date("2027-02-25T00:00:00.000Z"),
        startBy: null,
        estimatedMinutes: 120,
        milestoneId: null,
        priority: 3,
      },
      dependentTaskCount: 0,
      milestone: null,
      remainingMinutes: 600,
      availableMinutes: null,
      ...overrides,
    };
  }

  it("measures how far behind the work is", () => {
    expect(calculateImpact(impactInputs()).daysBehind).toBe(4);
  });

  it("notices when other work is blocked behind the missed task", () => {
    expect(calculateImpact(impactInputs({ dependentTaskCount: 2 })).affectsDependency).toBe(true);
  });

  it("flags a milestone whose remaining time the slip has eaten into", () => {
    const impact = calculateImpact(
      impactInputs({
        milestone: {
          title: "Practice tests",
          targetDate: new Date("2027-03-04T00:00:00.000Z"),
          openTaskCount: 2,
        },
      }),
    );
    expect(impact.threatensMilestone).toBe(true);
  });

  it("keeps the target achievable while the date is still ahead", () => {
    expect(calculateImpact(impactInputs()).targetStillAchievable).toBe(true);
    expect(
      calculateImpact(impactInputs({ targetDate: new Date("2027-01-01T00:00:00.000Z") }))
        .targetStillAchievable,
    ).toBe(false);
  });

  // §14 — minor changes may be proposed quickly; material ones need the user.
  it("requires confirmation for a change that threatens a milestone", () => {
    const impact = calculateImpact(
      impactInputs({
        milestone: {
          title: "Practice tests",
          targetDate: new Date("2027-03-02T00:00:00.000Z"),
          openTaskCount: 1,
        },
      }),
    );
    expect(impact.severity).toBe("material");
    expect(impact.requiresConfirmation).toBe(true);
  });

  it("treats a small slip on low-priority work as minor", () => {
    const impact = calculateImpact(
      impactInputs({
        missedTask: {
          title: "Optional reading",
          deadline: new Date("2027-02-28T00:00:00.000Z"),
          startBy: null,
          estimatedMinutes: 30,
          milestoneId: null,
          priority: 5,
        },
      }),
    );
    expect(impact.severity).toBe("minor");
    expect(impact.requiresConfirmation).toBe(false);
  });

  it("leaves capacity unknown until Calendar is connected", () => {
    expect(calculateImpact(impactInputs()).hasCapacityToRecover).toBeNull();
    expect(
      calculateImpact(impactInputs({ availableMinutes: 900 })).hasCapacityToRecover,
    ).toBe(true);
  });

  // §14 — "Never silently change the user's final goal."
  it("rejects any recovery proposal that moves the target date", () => {
    const moves: Replan = {
      consequence: "You won't make it, so let's push the exam back a month.",
      changes: [{ kind: "reduce_scope", description: "Move the target date" }],
      keeps_target_date: false,
      reasoning: "",
    };
    const keeps: Replan = {
      consequence: "About 3.5 hours behind, still achievable.",
      changes: [{ kind: "add_time", description: "+30 minutes Thursday" }],
      keeps_target_date: true,
      reasoning: "",
    };
    expect(isSafeReplan(moves)).toBe(false);
    expect(isSafeReplan(keeps)).toBe(true);
  });
});

describe("Execution Profile (PRD §10)", () => {
  it("buckets hours into the windows §10 uses", () => {
    expect(windowForHour(8)).toBe("morning");
    expect(windowForHour(14)).toBe("afternoon");
    expect(windowForHour(21)).toBe("evening");
  });

  it("stays undecided until there is enough evidence", () => {
    expect(bestWindow({ completion_by_time: { morning: { completed: 1, total: 1 } } })).toBe(
      "varies",
    );
  });

  it("names the window where work actually gets finished", () => {
    expect(
      bestWindow({
        completion_by_time: {
          morning: { completed: 8, total: 10 },
          evening: { completed: 1, total: 6 },
        },
      }),
    ).toBe("morning");
  });

  it("says it varies when no window is reliable", () => {
    expect(
      bestWindow({
        completion_by_time: {
          morning: { completed: 1, total: 5 },
          evening: { completed: 1, total: 5 },
        },
      }),
    ).toBe("varies");
  });

  it("ranks interventions this person has actually taken up", () => {
    const ranked = rankEffectiveInterventions({
      effective_interventions: {
        shrink_first_step: { accepted: 4, offered: 5 },
        reschedule_window: { accepted: 1, offered: 6 },
        timebox: { accepted: 0, offered: 3 },
      },
    });
    expect(ranked[0]).toBe("shrink_first_step");
    // Never offered successfully — must not be recommended.
    expect(ranked).not.toContain("timebox");
  });

  it("returns nothing for a brand-new user", () => {
    expect(rankEffectiveInterventions({})).toEqual([]);
  });
});
