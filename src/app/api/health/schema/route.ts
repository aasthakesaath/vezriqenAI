import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySchema, describeSchemaGaps } from "@/lib/db/verify-schema";
import { SUPABASE_CONFIGURED, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is the live database in step with this build?
 *
 * Public because it reports only structure — table and column NAMES that are
 * already in the repository — and never a row. Knowing that `goals` has a
 * `short_label` column tells an attacker nothing they could not read in
 * supabase/migrations/, and a health check that needs a secret is a health
 * check nobody runs.
 *
 * 200 when the schema matches, 503 when it does not, so it can be watched.
 */
export async function GET() {
  if (!SUPABASE_CONFIGURED || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 });
  }

  const report = await verifySchema(createAdminClient());

  return NextResponse.json(
    {
      ok: report.ok,
      checkedTables: report.checkedTables,
      checkedColumns: report.checkedColumns,
      gaps: report.gaps,
      unreachable: report.unreachable,
      summary: report.ok ? "Schema matches the code." : describeSchemaGaps(report),
    },
    { status: report.ok ? 200 : 503 },
  );
}
