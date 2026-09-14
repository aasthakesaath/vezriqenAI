/**
 * What makes two task titles the same task.
 *
 * The authority is `public.normalized_task_title(text)` in
 * supabase/migrations/0012_task_title_dedupe.sql — it is what the generated
 * `tasks.title_key` column and the unique index on (goal_id, title_key) are
 * built from, so the database has the final say and always will.
 *
 * This is the same rule in TypeScript, for the two things the database cannot
 * do from where they stand:
 *
 *   * a batch about to be written can contain the duplicate WITHIN itself, and
 *     seeing that before the round trip is cheaper than sending it;
 *   * a route that generates new titles (breaking a task into pieces) has to
 *     avoid colliding with what is already stored, and a rejected insert is a
 *     worse answer than a title that was distinct in the first place.
 *
 * Kept deliberately small and character-level. Nothing semantic: "Email Priya"
 * and "Send Priya an email" are two different sentences, and a normaliser that
 * merged them would be deciding the plan was wrong.
 */

/**
 * The SQL is `nullif(btrim(regexp_replace(lower($1), '[^[:alnum:]]+', ' ', 'g')), '')`.
 *
 * `[[:alnum:]]` in a UTF-8 Postgres database matches letters and digits in any
 * script, which is what `\p{L}\p{N}` matches here. The `u` flag is required for
 * the property escapes to mean anything at all.
 */
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/**
 * The comparison key for a title, or null when there is nothing to compare.
 *
 * Null rather than "" on purpose, mirroring the column: a title made entirely
 * of punctuation has no key, and two of those are not evidence of a duplicate.
 * Nulls do not collide in a Postgres unique index either, so the two agree.
 */
export function taskTitleKey(title: string | null | undefined): string | null {
  if (typeof title !== "string") return null;
  const key = title.toLowerCase().replace(NON_ALPHANUMERIC, " ").trim();
  return key === "" ? null : key;
}

/** True when two titles would occupy the same row of a goal. */
export function isSameTaskTitle(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = taskTitleKey(a);
  return left !== null && left === taskTitleKey(b);
}

/**
 * Drops the titles a goal already holds, and any repeat within the batch.
 *
 * The database would refuse them anyway — that is the point of the unique
 * index — but `ignoreDuplicates` returns only the rows it actually inserted,
 * so a caller that needs to know which of its items landed is better off not
 * offering the ones that cannot.
 *
 * Order is preserved, and the FIRST occurrence of a repeated title is the one
 * kept, so "the earliest wins" means the same thing here as it does in 0012.
 */
export function withoutDuplicateTitles<T>(
  items: T[],
  titleOf: (item: T) => string,
  alreadyPresent: Iterable<string> = [],
): T[] {
  const seen = new Set<string>();
  for (const title of alreadyPresent) {
    const key = taskTitleKey(title);
    if (key) seen.add(key);
  }

  const kept: T[] = [];
  for (const item of items) {
    const key = taskTitleKey(titleOf(item));
    // No key means no collision — see above. It is written, not dropped.
    if (key !== null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    kept.push(item);
  }
  return kept;
}
