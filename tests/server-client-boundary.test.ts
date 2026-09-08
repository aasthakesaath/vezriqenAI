import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A server component may not import a VALUE from a "use client" module.
 *
 * Next.js replaces a client module's exports with client references in the
 * server bundle. A component import is fine — that reference is exactly what
 * React needs. A plain object is not: it arrives as undefined, and the first
 * property access throws. That is how POSE_FOR crashed /today, /goals,
 * /goals/[id] and /settings in production with
 *
 *   TypeError: Cannot read properties of undefined (reading 'src')
 *
 * while 336 unit tests stayed green — vitest imports the module directly, with
 * no transform, so the bug only exists once Next has built it. This test is
 * the substitute for that transform.
 */

const CLIENT_DIRECTIVE = /^\s*["']use client["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const ALL = walk("src");
const isClientModule = (file: string) => CLIENT_DIRECTIVE.test(readFileSync(file, "utf8"));

/** "@/components/VezriWorking" -> src/components/VezriWorking.tsx */
function resolve(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join("src", spec.slice(2));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
}

describe("the server/client boundary", () => {
  it("no server component imports a non-component value from a client module", () => {
    const offenders: string[] = [];

    for (const file of ALL) {
      const source = readFileSync(file, "utf8");
      if (CLIENT_DIRECTIVE.test(source)) continue; // client files may import freely

      for (const match of source.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g,
      )) {
        const target = resolve(match[2]);
        if (!target || !isClientModule(target)) continue;

        for (const raw of match[1].split(",")) {
          const name = raw.split(/\s+as\s+/).pop()!.trim();
          if (!name || name.startsWith("type ")) continue;
          // Used as JSX somewhere in the file? Then it is a component, which is
          // the one thing that DOES survive the boundary.
          if (new RegExp(`<${name}[\\s/>]`).test(source)) continue;
          offenders.push(
            `${file} imports { ${name} } from "${match[2]}" ("use client"). ` +
              `It will be undefined at runtime — move the value to a plain module.`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("proves it can see the arrangement that broke", () => {
    // VezriWorking is still a client module, and the constants are not in it.
    expect(isClientModule("src/components/VezriWorking.tsx")).toBe(true);
    expect(isClientModule("src/lib/vezri-poses.ts")).toBe(false);
    const poses = readFileSync("src/lib/vezri-poses.ts", "utf8");
    expect(poses).toContain("export const POSE_FOR");
    expect(poses).toContain("export const POSES");
  });
});
