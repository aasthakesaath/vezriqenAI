import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsNav from "@/components/app/SettingsNav";
import { HEADING_SCROLL_MARGIN, SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * The jump nav on /settings.
 *
 * The failure this exists to catch is silent: a nav item whose target id was
 * renamed or removed still renders, still looks like a link, and scrolls
 * nowhere when pressed. Nothing throws and nothing logs. So the targets are
 * checked against the components that own them rather than trusted.
 */

/** Where each target's heading actually lives. */
const OWNER: Record<string, string> = {
  "timezone-heading": "src/components/app/TimeZoneSetting.tsx",
  "reminders-heading": "src/components/app/ReminderPreferences.tsx",
  "calendar-heading": "src/components/app/CalendarConnection.tsx",
  "delete-account-heading": "src/components/app/DeleteAccount.tsx",
};

const markup = renderToStaticMarkup(<SettingsNav />);

describe("the settings jump nav", () => {
  it("links to every section, in page order", () => {
    const hrefs = [...markup.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(SETTINGS_SECTIONS.map((section) => section.target));
  });

  it("names each section", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(markup, `${section.label} should be in the nav`).toContain(section.label);
    }
  });

  it("includes the account deletion control", () => {
    expect(markup).toContain("Delete account");
    expect(markup).toContain('href="#delete-account-heading"');
  });

  it("is a nav a screen reader can tell apart from the app nav", () => {
    expect(markup).toContain('aria-label="Settings sections"');
  });

  it("marks nothing as the current page", () => {
    // Every link addresses the page you are already on, so there is no "here"
    // to mark. aria-current on any of them would be a claim the markup cannot
    // support — and it would be on all four or none.
    expect(markup).not.toContain("aria-current");
  });
});

describe("every target actually exists", () => {
  it("has an owning component for each nav target", () => {
    expect(Object.keys(OWNER).sort()).toEqual(
      SETTINGS_SECTIONS.map((section) => section.target).sort(),
    );
  });

  it("finds the id on a heading in that component", () => {
    for (const [target, path] of Object.entries(OWNER)) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} should carry id="${target}"`).toContain(`id="${target}"`);
    }
  });

  it("keeps the section labelled by the heading it links to", () => {
    // The target doubles as the section's aria-labelledby. If one moved
    // without the other, the jump and the label would name different things.
    for (const [target, path] of Object.entries(OWNER)) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} should label its section by ${target}`).toContain(
        `aria-labelledby="${target}"`,
      );
    }
  });

  it("clears the sticky header on every heading it lands on", () => {
    // Without the scroll margin the heading lands underneath the 4.5rem
    // sticky app header — visible only on a device, never in a unit test that
    // does not look for it.
    for (const [target, path] of Object.entries(OWNER)) {
      const source = readFileSync(path, "utf8");
      const heading = source.slice(source.indexOf(`id="${target}"`));
      expect(
        heading.slice(0, 200),
        `the ${target} heading needs ${HEADING_SCROLL_MARGIN}`,
      ).toContain(HEADING_SCROLL_MARGIN);
    }
  });
});
