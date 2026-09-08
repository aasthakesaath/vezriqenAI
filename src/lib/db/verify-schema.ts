import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPECTED_SCHEMA } from "./schema-manifest";

/**
 * Compares the live database against what the code expects.
 *
 * Written after a migration that existed in the repo but had never been
 * APPLIED cost a full extraction: the model work completed, then the final
 * write failed with
 *
 *   "Could not find the 'short_label' column of 'goals' in the schema cache"
 *
 * A missing column is not a runtime error to be handled gracefully — it is a
 * deployment that is not finished. It should be loud, early, and name the
 * column, not surface as a save failure at the end of a long paid operation.
 *
 * Deliberately probing PostgREST rather than reading information_schema:
 * information_schema is not exposed through the REST API without adding a
 * function, and this check must not itself depend on a migration having been
 * applied.
 */

export type SchemaGap = { table: string; missing: string[] };

export type SchemaReport = {
  ok: boolean;
  gaps: SchemaGap[];
  /** Tables that could not be reached at all — usually the whole schema. */
  unreachable: string[];
  checkedTables: number;
  checkedColumns: number;
};

/** True when the error is PostgREST telling us a column is not there. */
function isMissingColumn(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /does not exist/i.test(message)
  );
}

async function tableAccepts(
  supabase: SupabaseClient,
  table: string,
  columns: readonly string[],
): Promise<string | null> {
  // head + limit 0: asks the API to validate the column list without reading
  // any rows, so this is cheap and touches no user data.
  const { error } = await supabase
    .from(table)
    .select(columns.join(","), { head: true, count: "exact" })
    .limit(0);
  return error?.message ?? null;
}

export async function verifySchema(supabase: SupabaseClient): Promise<SchemaReport> {
  const gaps: SchemaGap[] = [];
  const unreachable: string[] = [];
  let checkedColumns = 0;

  for (const [table, columns] of Object.entries(EXPECTED_SCHEMA)) {
    checkedColumns += columns.length;

    const error = await tableAccepts(supabase, table, columns);
    if (!error) continue;

    if (!isMissingColumn(error)) {
      // Permissions, a missing table, a network problem — not our business to
      // guess at, but worth reporting separately from a column gap.
      unreachable.push(`${table}: ${error}`);
      continue;
    }

    // One column at a time, but only for the table that failed. The whole
    // point is to name every missing column, not just the first one PostgREST
    // happens to complain about.
    const missing: string[] = [];
    for (const column of columns) {
      if (await tableAccepts(supabase, table, [column])) missing.push(column);
    }
    if (missing.length > 0) gaps.push({ table, missing });
    else unreachable.push(`${table}: ${error}`);
  }

  return {
    ok: gaps.length === 0 && unreachable.length === 0,
    gaps,
    unreachable,
    checkedTables: Object.keys(EXPECTED_SCHEMA).length,
    checkedColumns,
  };
}

/** One line per gap, for a log or an error message. */
export function describeSchemaGaps(report: SchemaReport): string {
  const parts = report.gaps.map(
    ({ table, missing }) => `${table} is missing ${missing.join(", ")}`,
  );
  return [...parts, ...report.unreachable].join("; ");
}

/**
 * Cached across requests in a warm lambda.
 *
 * The schema does not change between requests, and probing 17 tables before
 * every extraction would be its own cost. A gap is NOT cached: once someone
 * applies the migration the next request should see it, without a redeploy.
 */
let healthy = false;

export async function assertSchemaReady(supabase: SupabaseClient): Promise<SchemaReport | null> {
  if (healthy) return null;
  const report = await verifySchema(supabase);
  if (report.ok) {
    healthy = true;
    return null;
  }
  console.error(
    `[schema] The database is behind the code: ${describeSchemaGaps(report)}. ` +
      `Apply the pending migrations in supabase/migrations/.`,
  );
  return report;
}

/** Test seam — the cache is module state and would leak between cases. */
export function resetSchemaCache(): void {
  healthy = false;
}
