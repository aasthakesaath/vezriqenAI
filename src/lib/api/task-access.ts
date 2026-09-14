import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTerminalTaskStatus, terminalStatusReason } from "@/lib/plan/task-status";

/**
 * Loading one task, with a 404 that means what it says.
 *
 * THE BUG THIS EXISTS FOR. Every route did this:
 *
 *   const { data: task } = await supabase.from("tasks").select(...).eq("id", id).maybeSingle();
 *   if (!task) return NextResponse.json({ error: "Not found." }, { status: 404 });
 *
 * `error` is discarded, so `data` is null for two completely different
 * reasons — the row is not there, or the QUERY FAILED — and both came out as
 * "Not found." In production /api/tasks/[id]/stuck answered 404 three times
 * for a task that existed, belonged to the caller and was sitting in the
 * database the whole time, because its select embedded `task_dependencies`
 * and PostgREST refused to run it: task_dependencies has TWO foreign keys to
 * tasks (task_id and depends_on_task_id), so the embed is ambiguous and comes
 * back as PGRST201 rather than rows. The route reported the task missing.
 * /api/tasks/[id]/checkin, whose select embeds nothing, returned 200 for the
 * same task three seconds earlier.
 *
 * So the outcomes are separated here, once:
 *
 *   query failed    502, logged with the PostgREST code. Never a 404 — the
 *                   row's existence is unknown, and saying "not found" is
 *                   asserting something we did not learn.
 *   no row          404. The task genuinely is not there, or RLS refused it
 *                   because it is not the caller's, which are the same answer
 *                   and deliberately indistinguishable from outside.
 *   terminal state  409, with the status on it. A real conflict: the task is
 *                   there and it is theirs, and the work on this row is over.
 */

export type TaskLookup<T> = { ok: true; task: T } | { ok: false; response: NextResponse };

export async function loadOwnTask<T>(options: {
  supabase: SupabaseClient;
  /** Names the caller in the log line: "tasks/[id]/stuck". */
  route: string;
  taskId: string;
  /** PostgREST select list. Keep embeds out of it unless they are unambiguous. */
  columns: string;
  /**
   * Refuse a task whose work is over (done, split). Off by default: reading
   * something already paid for — cached guidance, say — is harmless whatever
   * state the task is in, and only the paths that would CHANGE the task or
   * spend a model call need to care.
   */
  requireOutstanding?: boolean;
}): Promise<TaskLookup<T>> {
  const { supabase, route, taskId, columns, requireOutstanding = false } = options;

  const { data, error } = await supabase
    .from("tasks")
    .select(columns)
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    // The class of failure that spent a production outage looking like a
    // missing row. The code is the useful part: PGRST201 is an ambiguous
    // embed, PGRST204 a column that is not there, 42501 an RLS refusal.
    console.error(
      `[task] ${route}: could not read task ${taskId} — ` +
        `${error.code ?? "no code"}: ${error.message}`,
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Vezri couldn't read that task just now.", retryable: true },
        { status: 502 },
      ),
    };
  }

  if (!data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }

  const task = data as T;
  const status = (data as { status?: unknown }).status;

  if (requireOutstanding && typeof status === "string" && isTerminalTaskStatus(status)) {
    // Not a 404 and not a 500. The task is there, it is theirs, and the
    // answer is about its state — so the client can say something true about
    // it rather than "not found", which would be a lie the user can disprove
    // by looking at the row on the goal page.
    console.info(`[task] ${route}: refused task ${taskId} in terminal state "${status}"`);
    return {
      ok: false,
      response: NextResponse.json(
        { error: terminalStatusReason(status), task_status: status, retryable: false },
        { status: 409 },
      ),
    };
  }

  return { ok: true, task };
}

/**
 * Who a task is waiting on, as its own query.
 *
 * NOT an embed. `task_dependencies(external_party_name)` inside a tasks
 * select is ambiguous — two foreign keys from that table point at tasks — and
 * PostgREST answers PGRST201 instead of rows. A disambiguating hint would
 * work, but this is a plain query against a single-column index that cannot
 * be got subtly wrong by a PostgREST version, on routes that are about to
 * spend a model call anyway. See loadOwnTask's header for what the embed cost.
 */
export async function waitingOnName(options: {
  supabase: SupabaseClient;
  taskId: string;
}): Promise<string | null> {
  const { data } = await options.supabase
    .from("task_dependencies")
    .select("external_party_name")
    .eq("task_id", options.taskId)
    .eq("dependency_type", "external_person")
    .is("resolved_at", null);

  for (const row of data ?? []) {
    const name = (row as { external_party_name: string | null }).external_party_name;
    if (name) return name;
  }
  return null;
}
