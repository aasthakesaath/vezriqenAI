import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import VezriWorking, { VezriPoseImage } from "@/components/VezriWorking";
import { POSE_FOR, poseAlt, type VezriPose } from "@/lib/vezri-poses";
import TodayList from "@/components/app/TodayList";
import { UNDERSTANDING_STEPS, AUDIT_STEPS, COACH_STEPS } from "@/lib/app-copy";

/**
 * Vezri now has three poses, and which one appears is a product decision, not
 * a styling one. These tests pin that decision.
 *
 * The one that matters most is the last group: the confused pose must never
 * turn up on a path where nothing went wrong. §13 forbids the coach from using
 * guilt or disappointment, and a puzzled mascot holding a question mark is
 * disappointment whatever the copy says.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const FILE: Record<VezriPose, string> = {
  reading: "/brand/vezri-reading.webp",
  thinking: "/brand/vezri-thinking.webp",
  confused: "/brand/vezri-confused.webp",
};

/** renderToStaticMarkup writes the src through Next's optimiser, URL-encoded. */
const usesPose = (markup: string, pose: VezriPose) =>
  markup.includes(encodeURIComponent(FILE[pose])) || markup.includes(FILE[pose]);

describe("the pose map is the one place a state picks artwork", () => {
  it("maps every product state to its intended pose", () => {
    expect(POSE_FOR).toEqual({
      readingPlan: "reading",
      buildingPlan: "thinking",
      audit: "thinking",
      goalHealth: "thinking",
      coach: "thinking",
      failure: "confused",
      uploadRejected: "confused",
      coachFailure: "thinking",
    });
  });

  it("no screen reaches for a pose file directly", () => {
    // The whole point of the prop: artwork changes in one file, not fourteen.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        // The two files that legitimately name the artwork: the pose table
        // itself, and the component that renders it.
        if (path.endsWith(join("lib", "vezri-poses.ts"))) continue;
        if (path.endsWith(join("components", "VezriWorking.tsx"))) continue;
        const source = readFileSync(path, "utf8");
        if (/vezri-(reading|thinking|confused)\.webp/.test(source)) offenders.push(path);
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});

describe("each state renders its intended pose", () => {
  it("reading a plan shows Vezri reading", () => {
    const markup = html(
      <VezriWorking stages={UNDERSTANDING_STEPS} pose={POSE_FOR.readingPlan} />,
    );
    expect(usesPose(markup, "reading")).toBe(true);
    expect(usesPose(markup, "confused")).toBe(false);
  });

  it("the audit and the coach show Vezri thinking", () => {
    for (const [stages, pose] of [
      [AUDIT_STEPS, POSE_FOR.audit],
      [COACH_STEPS, POSE_FOR.coach],
    ] as const) {
      const markup = html(<VezriWorking stages={stages} pose={pose} />);
      expect(usesPose(markup, "thinking")).toBe(true);
      expect(usesPose(markup, "confused")).toBe(false);
    }
  });

  it("building the plan and goal health show Vezri thinking", () => {
    expect(POSE_FOR.buildingPlan).toBe("thinking");
    expect(POSE_FOR.goalHealth).toBe("thinking");
  });

  it("a failure shows Vezri confused, replacing the working pose", () => {
    const markup = html(
      <VezriWorking
        stages={UNDERSTANDING_STEPS}
        pose={POSE_FOR.readingPlan}
        error="Vezri couldn't read that plan."
        errorPose={POSE_FOR.failure}
      />,
    );
    expect(usesPose(markup, "confused")).toBe(true);
    expect(usesPose(markup, "reading")).toBe(false);
  });

  it("an upload rejection shows Vezri confused", () => {
    const markup = html(<VezriPoseImage pose={POSE_FOR.uploadRejected} alt="" />);
    expect(usesPose(markup, "confused")).toBe(true);
  });
});

describe("the confused pose stays off paths where nothing went wrong", () => {
  it("never appears while work is in progress", () => {
    for (const [stages, pose] of [
      [UNDERSTANDING_STEPS, POSE_FOR.readingPlan],
      [AUDIT_STEPS, POSE_FOR.audit],
      [COACH_STEPS, POSE_FOR.coach],
    ] as const) {
      expect(usesPose(html(<VezriWorking stages={stages} pose={pose} />), "confused")).toBe(false);
    }
  });

  it("never appears when the coach fails, even though that is a real failure", () => {
    // §13: the user has just said they did not do something. The error text
    // carries the problem; the drawing must not add disappointment to it.
    expect(POSE_FOR.coachFailure).not.toBe("confused");

    const markup = html(
      <VezriWorking
        stages={COACH_STEPS}
        pose={POSE_FOR.coach}
        error="Couldn't work that out just now."
        errorPose={POSE_FOR.coachFailure}
      />,
    );
    expect(usesPose(markup, "confused")).toBe(false);
    expect(usesPose(markup, "thinking")).toBe(true);
  });

  it("never appears on a good empty state", () => {
    // "Nothing needs you today" is being caught up, not a problem.
    const caughtUp = html(<TodayList groups={[]} />);
    expect(usesPose(caughtUp, "confused")).toBe(false);
    expect(caughtUp).toContain("Nothing needs you today");
  });
});

describe("alt text describes the state, not the bird", () => {
  it("names what Vezri is doing when the image stands alone", () => {
    for (const pose of ["reading", "thinking", "confused"] as const) {
      const markup = html(<VezriPoseImage pose={pose} alt={`fallback-${pose}`} />);
      expect(markup).toContain(`alt="fallback-${pose}"`);
    }
  });

  it("is decorative inside the working card, where the stage line already says it", () => {
    const markup = html(<VezriWorking stages={[UNDERSTANDING_STEPS[0]]} pose="reading" />);
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
    // The state is still announced — just as text, in the live region.
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain(UNDERSTANDING_STEPS[0]);
  });

  it("never describes the bird", () => {
    // Asserted against the component's own strings via poseAlt, not a copy of
    // them retyped here — a duplicate would keep passing after the real text
    // changed.
    for (const pose of ["reading", "thinking", "confused"] as const) {
      const alt = poseAlt(pose);
      expect(alt).toMatch(/^Vezri (is|ran)\b/);
      for (const plumage of ["falcon", "pink", "bird", "mascot", "cartoon", "illustration"]) {
        expect(alt.toLowerCase()).not.toContain(plumage);
      }
      // And it reaches the DOM.
      expect(html(<VezriPoseImage pose={pose} alt={alt} />)).toContain(`alt="${alt}"`);
    }
  });

  it("gives each pose a description specific to its state", () => {
    const alts = (["reading", "thinking", "confused"] as const).map(poseAlt);
    expect(new Set(alts).size).toBe(3);
    expect(poseAlt("reading")).toContain("reading");
  });
});

describe("poses swap rather than animate", () => {
  it("carries no transition, so a pose change is not a crossfade", () => {
    // prefers-reduced-motion suppresses animations; a CSS transition would
    // slip past that rule, so there simply is not one.
    const markup = html(<VezriPoseImage pose="thinking" alt="" />);
    expect(markup).toContain("transition-none");
    expect(markup).not.toMatch(/transition-(all|opacity|colors|transform)\b/);
  });
});
