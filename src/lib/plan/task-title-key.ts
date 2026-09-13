/**
 * The same key the database generates, computed in TypeScript.
 *
 * `public.task_title_key(text)` in 0012 is the authority: it is what
 * tasks.title_key is generated from and what the unique index on
 * (goal_id, title_key) is built over. This is a mirror of it, and it exists
 * for one reason — a batch of extracted tasks can contain two rows that are
 * duplicates of EACH OTHER, and the cheapest place to notice that is before
 * the insert rather than in Postgres's speculative-insertion path.
 *
 * ON CONFLICT DO NOTHING does handle the intra-batch case correctly, so this
 * is not load-bearing for correctness. What it buys is a straight answer to
 * "how many tasks did that pass actually write": a batch deduplicated here
 * inserts what it says it inserts, instead of silently discarding rows inside
 * the statement and leaving the caller to work out which titles survived.
 *
 * The two implementations must agree. tests/task-duplicates.test.ts asserts
 * the SQL body and this function against the same table of cases, so a change
 * to one that is not made to the other fails the build.
 */

/**
 * Lowercase, every run of non-alphanumerics collapsed to a single space,
 * trimmed. Null when nothing is left.
 *
 * ASCII-only on purpose, matching the SQL: a key that reads the collation is a
 * key whose value depends on which database evaluated it.
 */
export function taskTitleKey(title: string | null | undefined): string | null {
  const key = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return key.length > 0 ? key : null;
}

/**
 * Removes rows that would collide with an earlier row in the same batch.
 *
 * First write wins, which is the same rule 0012 applied to the rows that were
 * already there: the earliest version of a title is the one kept.
 */
export function dedupeByTitle<T>(rows: T[], titleOf: (row: T) => string): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const key = taskTitleKey(titleOf(row));
    // A title that normalises to nothing has no key, so it cannot collide with
    // anything — the unique index treats those rows as distinct too.
    if (key === null) {
      kept.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}
