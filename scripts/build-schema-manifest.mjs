/**
 * Derives src/lib/db/schema-manifest.ts from supabase/migrations/.
 *
 * The manifest is what the health check compares the live database against.
 * It is GENERATED rather than hand-written because a hand-written list drifts
 * silently — which is the exact failure it exists to catch. A test regenerates
 * it and fails if the checked-in copy is stale.
 *
 *   node scripts/build-schema-manifest.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const tables = new Map(); // table -> Map(column -> migration file)

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(DIR, file), "utf8");

  for (const m of sql.matchAll(
    /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi,
  )) {
    const [, table, body] = m;
    if (!tables.has(table)) tables.set(table, new Map());
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      if (!line || line.startsWith("--")) continue;
      if (/^(constraint|primary key|unique|check|foreign key)\b/i.test(line)) continue;
      const col = line.split(/\s+/)[0];
      if (/^[a-z_][a-z0-9_]*$/i.test(col) && !tables.get(table).has(col)) {
        tables.get(table).set(col, file);
      }
    }
  }

  for (const m of sql.matchAll(
    /alter table\s+public\.(\w+)\s+add column\s+(?:if not exists\s+)?(\w+)/gi,
  )) {
    const [, table, col] = m;
    if (!tables.has(table)) tables.set(table, new Map());
    if (!tables.get(table).has(col)) tables.get(table).set(col, file);
  }
}

const entries = [...tables.entries()].sort(([a], [b]) => a.localeCompare(b));
const body = entries
  .map(([table, cols]) => {
    const list = [...cols.entries()].sort(([a], [b]) => a.localeCompare(b));
    const lines = list.map(([col, file]) => `    ${JSON.stringify(col)}, // ${file}`);
    return `  ${JSON.stringify(table)}: [\n${lines.join("\n")}\n  ],`;
  })
  .join("\n");

writeFileSync(
  "src/lib/db/schema-manifest.ts",
  `/**
 * Every table and column the application expects, derived from
 * supabase/migrations/.
 *
 * GENERATED — do not edit. Run \`node scripts/build-schema-manifest.mjs\`
 * after adding a migration; tests/schema-manifest.test.ts fails if this file
 * is out of date.
 *
 * This exists because a migration that was written but never APPLIED is
 * invisible until something tries to write the column, and then it surfaces
 * as a save failure at the end of a long, paid-for operation:
 *
 *   "Could not find the 'short_label' column of 'goals' in the schema cache"
 *
 * The extract route checks this before calling the model, so a missing column
 * costs a fast 503 naming the column instead of two minutes of extraction
 * thrown away at the final write.
 */

export const EXPECTED_SCHEMA: Record<string, readonly string[]> = {
${body}
};

/** Tables in the order the migrations create them. */
export const EXPECTED_TABLES = Object.keys(EXPECTED_SCHEMA);
`,
);

const totalCols = entries.reduce((n, [, c]) => n + c.size, 0);
console.log(`schema-manifest.ts: ${entries.length} tables, ${totalCols} columns`);
