import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Removing uploaded plans from object storage.
 *
 * Shared by account deletion and goal deletion because both make the same
 * promise and both have the same hazard: the row cascade cannot reach the
 * bucket. Deleting rows first would strand files that nothing points at and
 * nobody can see — which is precisely the state a direct `delete from
 * public.goals` leaves behind (see scripts/orphaned-objects.mjs).
 *
 * Objects live at `<user_id>/<goal_id>/<uuid>.<ext>`, so a prefix is a real
 * boundary here: `<user_id>` is an account and `<user_id>/<goal_id>` is a
 * goal. Sweeping the prefix rather than the recorded paths is what makes the
 * promise true for an upload whose row insert failed — the file exists, it is
 * the user's, and no row mentions it.
 */

export const PLAN_DOCUMENTS_BUCKET = "plan-documents";

/** The prefix holding one account's uploads. */
export function accountStoragePrefix(userId: string): string {
  return userId;
}

/** The prefix holding one goal's uploads. */
export function goalStoragePrefix(userId: string, goalId: string): string {
  return `${userId}/${goalId}`;
}

/** Paths per remove() call. */
const REMOVE_CHUNK = 100;
/** One page of list(). */
const LIST_PAGE = 100;
/** `<user>/<goal>/<file>` is three levels. A loop guard, not a limit. */
const MAX_DEPTH = 6;

/**
 * A sweep that did not finish.
 *
 * `removed` is the honest count: the files that are actually gone when this
 * was thrown. Reported to the user rather than swallowed, because a file
 * someone believes is deleted and is not is worse than an error.
 */
export class StorageSweepError extends Error {
  constructor(
    message: string,
    readonly removed: number = 0,
  ) {
    super(message);
    this.name = "StorageSweepError";
  }
}

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

const planDocuments = (client: SupabaseClient): Bucket =>
  client.storage.from(PLAN_DOCUMENTS_BUCKET);

/** Every object under `prefix`, following folders down. */
export async function listObjectsUnder(
  client: SupabaseClient,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  const bucket = planDocuments(client);
  const found: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw new StorageSweepError(`Couldn't read stored files: ${error.message}`);

    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A folder comes back with no id of its own; a file is a leaf.
      if (entry.id == null) found.push(...(await listObjectsUnder(client, path, depth + 1)));
      else found.push(path);
    }
    if (entries.length < LIST_PAGE) break;
  }

  return found;
}

/** True when `path` is `prefix` itself or sits beneath it. */
export function isUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Removes objects, and refuses to report success unless every one of them
 * actually went.
 *
 * remove() reports what it deleted. Fewer than asked for means something in
 * that chunk is still in the bucket, and saying "deleted" over the top of that
 * is the lie this exists to prevent.
 */
export async function removeObjects(
  client: SupabaseClient,
  paths: string[],
): Promise<number> {
  const bucket = planDocuments(client);

  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { data, error } = await bucket.remove(chunk);
    if (error) {
      throw new StorageSweepError(`Couldn't remove stored files: ${error.message}`, removed);
    }

    const count = data?.length ?? 0;
    removed += count;
    if (count < chunk.length) {
      throw new StorageSweepError(
        `Only ${removed} of ${paths.length} stored files could be removed. ` +
          `The rest are still there.`,
        removed,
      );
    }
  }
  return removed;
}

/**
 * Everything under `prefix`, plus any recorded path that belongs there.
 *
 * Two sources on purpose. The rows say what the application wrote; the bucket
 * says what is actually in it. A recorded path outside the prefix is dropped
 * rather than trusted — `storage_path` comes from a row, and a row must never
 * be able to name somebody else's object for deletion.
 */
export async function collectObjects(options: {
  client: SupabaseClient;
  prefix: string;
  recordedPaths?: readonly (string | null | undefined)[];
}): Promise<string[]> {
  const { client, prefix, recordedPaths = [] } = options;

  const paths = new Set<string>();
  for (const path of recordedPaths) {
    if (path && isUnderPrefix(path, prefix)) paths.add(path);
  }
  for (const path of await listObjectsUnder(client, prefix)) {
    if (isUnderPrefix(path, prefix)) paths.add(path);
  }

  return [...paths].sort();
}

/**
 * Clears a whole prefix: `<user_id>` for an account, `<user_id>/<goal_id>` for
 * one goal. Returns how many objects went.
 */
export async function removeObjectsUnderPrefix(options: {
  client: SupabaseClient;
  prefix: string;
  recordedPaths?: readonly (string | null | undefined)[];
}): Promise<number> {
  const paths = await collectObjects(options);
  return removeObjects(options.client, paths);
}