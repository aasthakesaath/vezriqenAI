import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPECTED_SCHEMA } from "@/lib/db/schema-manifest";
import {
  accountStoragePrefix,
  collectObjects,
  removeObjects,
  StorageSweepError,
} from "@/lib/storage/plan-documents";

/**
 * Account deletion (PRD §23), which /privacy and /terms both promise.
 *
 * Two things make this more than one `delete from`:
 *
 *   1. Storage does not cascade. Every public table carries
 *      `references auth.users (id) on delete cascade`, so removing the auth
 *      user would clear the database on its own — but `storage.objects` has no
 *      such foreign key, and the uploaded plans live at
 *      `<user_id>/<goal_id>/<uuid>.<ext>`. Deleting the user first would leave
 *      those files in the bucket with no row and no account to trace them
 *      back to, which is the one outcome that cannot be repaired afterwards.
 *      So the whole `<user_id>` prefix goes first and the auth user goes last.
 *
 *   2. Two tables are unreachable from a session. `calendar_credentials` and
 *      `email_action_tokens` are RLS-on with no policies, which denies
 *      `authenticated` outright (see 0004_calendar_email.sql). Only the
 *      service role can clear them, which is why this takes an admin client
 *      and why the route that calls it does its own ownership check.
 *
 * The rows are deleted EXPLICITLY rather than left to the cascade. The cascade
 * would do it, but it is invisible: a table added in a later migration without
 * `on delete cascade` would outlive the account silently. Sweeping a named
 * list means tests/account-deletion.test.ts can prove the promise, and adding
 * a table without adding it here fails that test.
 */

/**
 * Every table, children before parents.
 *
 * The order is not strictly required — every inter-table foreign key is
 * `on delete cascade` or `on delete set null`, so no order can fail — but
 * deleting leaves first means each statement removes rows that are still
 * there, so an error names the table that actually refused.
 */
export const DELETION_ORDER = [
  "email_action_tokens",
  "calendar_blocks",
  "execution_blocks",
  "check_ins",
  "reminders",
  "task_dependencies",
  "tasks",
  "milestones",
  "goal_audits",
  "ai_action_logs",
  "plan_source_anchors",
  "plan_documents",
  "calendar_credentials",
  "calendar_connections",
  "execution_profiles",
  "goals",
  "profiles",
] as const;

/**
 * Which column carries the owner. `profiles` is keyed by the auth user id
 * itself; every other table has a `user_id`.
 */
export function ownerColumn(table: string): "id" | "user_id" {
  return (EXPECTED_SCHEMA[table] ?? []).includes("user_id") ? "user_id" : "id";
}

export type DeletionStage = "storage" | "rows" | "auth";

export class AccountDeletionError extends Error {
  constructor(
    message: string,
    readonly stage: DeletionStage,
    /** Files already removed when this was thrown. Reported to the user. */
    readonly filesRemoved = 0,
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

/**
 * Everything of this user's that is in the bucket: the whole `<user_id>`
 * prefix, plus any path their own document rows record.
 */
export async function collectStoredPaths(options: {
  admin: SupabaseClient;
  userId: string;
}): Promise<string[]> {
  const { admin, userId } = options;

  const { data: documents, error } = await admin
    .from("plan_documents")
    .select("storage_path")
    .eq("user_id", userId);
  if (error) {
    throw new AccountDeletionError(`Couldn't read your documents: ${error.message}`, "storage");
  }

  try {
    return await collectObjects({
      client: admin,
      prefix: accountStoragePrefix(userId),
      recordedPaths: (documents ?? []).map(
        (row) => (row as { storage_path?: string | null }).storage_path,
      ),
    });
  } catch (thrown) {
    if (thrown instanceof StorageSweepError) {
      throw new AccountDeletionError(thrown.message, "storage", thrown.removed);
    }
    throw thrown;
  }
}

export type AccountDeletionResult = {
  filesRemoved: number;
  tablesCleared: number;
};

/**
 * Deletes everything belonging to `userId`, in the only order that is safe:
 * stored objects, then rows, then the auth user itself.
 *
 * A storage failure stops the whole thing before a single row goes. That is
 * the point of the ordering: the account is still there, so the files still
 * have an owner and the person can try again. Carrying on would trade a
 * retryable error for a file nobody can reach.
 *
 * Deleting the auth user last is also what makes signing in again start fresh
 * — the `on_auth_user_created` trigger builds a new profile and execution
 * profile on the next sign-up, rather than the account waking up as an empty
 * shell of the old one.
 */
export async function deleteAccount(options: {
  admin: SupabaseClient;
  userId: string;
}): Promise<AccountDeletionResult> {
  const { admin, userId } = options;

  const paths = await collectStoredPaths({ admin, userId });

  let filesRemoved = 0;
  try {
    filesRemoved = await removeObjects(admin, paths);
  } catch (thrown) {
    if (thrown instanceof StorageSweepError) {
      throw new AccountDeletionError(thrown.message, "storage", thrown.removed);
    }
    throw thrown;
  }

  for (const table of DELETION_ORDER) {
    const { error } = await admin.from(table).delete().eq(ownerColumn(table), userId);
    if (error) {
      throw new AccountDeletionError(
        `Couldn't delete your ${table.replace(/_/g, " ")}: ${error.message}`,
        "rows",
        filesRemoved,
      );
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new AccountDeletionError(
      `Your data was deleted, but the sign-in itself could not be removed: ${error.message}`,
      "auth",
      filesRemoved,
    );
  }

  return { filesRemoved, tablesCleared: DELETION_ORDER.length };
}
