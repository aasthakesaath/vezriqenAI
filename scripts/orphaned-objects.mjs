/**
 * Finds — and optionally removes — files in the plan-documents bucket that no
 * `plan_documents` row points at.
 *
 * Why this exists: the row cascade cannot reach object storage. Deleting a
 * goal through the app clears its files first (see
 * src/lib/storage/plan-documents.ts), but a `delete from public.goals` run
 * straight against the database cascades the document ROWS away and leaves
 * every uploaded file behind, unreferenced and invisible to the person who
 * uploaded it.
 *
 * Everything here goes through the Storage API, in both directions. Supabase
 * installs `storage.protect_delete()` on `storage.objects`, so
 * `delete from storage.objects` raises 42501 — "Use the Storage API instead."
 * Listing is done the same way for the same reason: the bucket is the
 * authority on what is in it, not a table you can join against.
 *
 *   node scripts/orphaned-objects.mjs           # report only
 *   node scripts/orphaned-objects.mjs --delete  # remove what it reports
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment. The service role is required: it lists across every user's
 * prefix, which no session can do.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "plan-documents";
const PAGE = 100;
const REMOVE_CHUNK = 100;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const remove = process.argv.includes("--delete");

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = supabase.storage.from(BUCKET);

/** Every object under a prefix, following folders down. */
async function listUnder(prefix, depth = 0) {
  if (depth > 6) return [];
  const found = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list("${prefix}") failed: ${error.message}`);

    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A folder comes back with no id of its own; a file is a leaf.
      if (entry.id == null) found.push(...(await listUnder(path, depth + 1)));
      else found.push({ path, size: entry.metadata?.size ?? 0, created: entry.created_at ?? "" });
    }
    if (entries.length < PAGE) break;
  }
  return found;
}

/** Every storage_path the database still knows about. */
async function recordedPaths() {
  const paths = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("plan_documents")
      .select("storage_path")
      .range(from, from + 999);
    if (error) throw new Error(`reading plan_documents failed: ${error.message}`);
    for (const row of data ?? []) if (row.storage_path) paths.add(row.storage_path);
    if ((data ?? []).length < 1000) break;
  }
  return paths;
}

const [objects, recorded] = await Promise.all([listUnder(""), recordedPaths()]);
const orphans = objects.filter((object) => !recorded.has(object.path));

if (orphans.length === 0) {
  console.log(
    `${objects.length} object(s) in ${BUCKET}, all of them referenced. Nothing to clean up.`,
  );
  process.exit(0);
}

const bytes = orphans.reduce((total, o) => total + Number(o.size || 0), 0);
console.log(
  `${orphans.length} orphaned object(s) of ${objects.length} in ${BUCKET} ` +
    `(${(bytes / 1024 / 1024).toFixed(2)} MB):\n`,
);
// Grouped by user prefix, which is the first path segment.
const byUser = new Map();
for (const orphan of orphans) {
  const owner = orphan.path.split("/")[0];
  if (!byUser.has(owner)) byUser.set(owner, []);
  byUser.get(owner).push(orphan);
}
for (const [owner, list] of byUser) {
  console.log(`  ${owner}`);
  for (const o of list) console.log(`    ${o.path}${o.created ? `  (${o.created})` : ""}`);
}

if (!remove) {
  console.log(`\nReport only. Re-run with --delete to remove these ${orphans.length} object(s).`);
  process.exit(0);
}

let removed = 0;
for (let i = 0; i < orphans.length; i += REMOVE_CHUNK) {
  const chunk = orphans.slice(i, i + REMOVE_CHUNK).map((o) => o.path);
  const { data, error } = await bucket.remove(chunk);
  if (error) {
    console.error(`\nStopped after ${removed} removed: ${error.message}`);
    process.exit(1);
  }
  removed += data?.length ?? 0;
  // remove() reports what it actually deleted. Anything short of the chunk
  // means a file is still there, and saying "done" over that would be a lie.
  if ((data?.length ?? 0) < chunk.length) {
    console.error(
      `\nStopped: only ${removed} of ${orphans.length} could be removed. The rest are still there.`,
    );
    process.exit(1);
  }
}

console.log(`\nRemoved ${removed} orphaned object(s).`);
