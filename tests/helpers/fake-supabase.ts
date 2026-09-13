import type { SupabaseClient } from "@supabase/supabase-js";
import { taskTitleKey } from "@/lib/plan/task-title-key";

/**
 * A small in-memory stand-in for the PostgREST query builder.
 *
 * Enough of the surface that src/lib/plan/build.ts runs against it unchanged:
 * select/insert/upsert/update/delete, eq, in, is, order, limit,
 * single/maybeSingle, and head counts. It exists so resumption can be tested
 * for what it actually claims — that a second attempt does not re-run the
 * passes that already landed — rather than against a hand-written double of
 * the code under test.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

/**
 * Columns Postgres fills in on write, mirrored here.
 *
 * `tasks.title_key` is `generated always as (public.task_title_key(title))`
 * (0012), and the unique index on (goal_id, title_key) is what stops a task
 * being written twice. A fake that did not generate it would accept the
 * duplicate write this project just spent a migration removing, and the test
 * would pass while production did the opposite.
 */
const GENERATED: Record<string, Record<string, (row: Row) => unknown>> = {
  tasks: { title_key: (row) => taskTitleKey(row.title as string | null) },
};

function withGenerated(table: string, row: Row): Row {
  const columns = GENERATED[table];
  if (!columns) return row;
  const filled: Row = { ...row };
  for (const [column, compute] of Object.entries(columns)) filled[column] = compute(row);
  return filled;
}

type Op = "select" | "insert" | "upsert" | "update" | "delete";
type Result = { data: unknown; error: { message: string } | null; count?: number };

let nextId = 1;

class Query implements PromiseLike<Result> {
  private filters: Array<[string, unknown]> = [];
  private op: Op = "select";
  private payload: Row[] = [];
  private head = false;
  private orderKey: string | null = null;
  private ascending = true;
  private limitTo: number | null = null;
  private singleMode: "one" | "maybe" | null = null;
  private inFilters: Array<[string, unknown[]]> = [];
  private conflictOn: string[] = ["id"];
  private ignoreDuplicates = false;

  constructor(
    private readonly db: Tables,
    private readonly table: string,
    private readonly writeFails: (table: string) => string | null,
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.head = options?.head ?? false;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  /**
   * `on_conflict` + `resolution=ignore-duplicates`, which is what
   * `.upsert(rows, { onConflict, ignoreDuplicates: true })` sends.
   *
   * The conflict is checked against what is already stored AND against
   * earlier rows in the same payload, because Postgres does the same: a batch
   * containing the same key twice inserts it once and does not error.
   */
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictOn = (options?.onConflict ?? "id").split(",").map((column) => column.trim());
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = [values];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  /** `.is("used_at", null)` — the only form the code under test uses. */
  is(column: string, value: null) {
    this.filters.push([column, value]);
    return this;
  }
  /** `.in("status", [...])` — matches when the row's value is in the list. */
  in(column: string, values: unknown[]) {
    this.inFilters.push([column, values]);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderKey = column;
    this.ascending = options?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitTo = n;
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    const all = this.db[this.table] ?? [];
    return all.filter(
      (row) =>
        this.filters.every(([column, value]) => row[column] === value) &&
        this.inFilters.every(([column, values]) => values.includes(row[column])),
    );
  }

  /** The value of a row's conflict target, as one comparable string. */
  private conflictKey(row: Row): string {
    return this.conflictOn.map((column) => String(row[column] ?? "\u0000")).join("\u0001");
  }

  private run(): Result {
    if (this.op !== "select") {
      const failure = this.writeFails(this.table);
      if (failure) return { data: null, error: { message: failure } };
    }

    if (this.op === "insert" || this.op === "upsert") {
      const stored = (this.db[this.table] ??= []);
      const seen = new Set(
        this.op === "upsert" ? stored.map((row) => this.conflictKey(row)) : [],
      );

      const inserted: Row[] = [];
      for (const row of this.payload) {
        const filled = withGenerated(this.table, {
          id: `id-${nextId++}`,
          created_at: new Date(Date.now() + nextId).toISOString(),
          ...row,
        });

        if (this.op === "upsert" && this.ignoreDuplicates) {
          const key = this.conflictKey(filled);
          // A NULL generated key never collides, exactly as a unique index
          // treats NULLs as distinct.
          const hasNullPart = this.conflictOn.some((column) => filled[column] == null);
          if (!hasNullPart && seen.has(key)) continue;
          seen.add(key);
        }

        stored.push(filled);
        inserted.push(filled);
      }

      // An ignored row returns nothing, which is what PostgREST does and what
      // the calling code has to be able to cope with.
      return { data: inserted, error: null };
    }
    if (this.op === "update") {
      const matched = this.matching();
      for (const row of matched) Object.assign(row, this.payload[0]);
      return { data: matched, error: null };
    }
    if (this.op === "delete") {
      const doomed = new Set(this.matching());
      this.db[this.table] = (this.db[this.table] ?? []).filter((row) => !doomed.has(row));
      return { data: null, error: null };
    }

    let matched = this.matching();
    if (this.orderKey) {
      const key = this.orderKey;
      matched = [...matched].sort((a, b) => {
        const comparison = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
        return this.ascending ? comparison : -comparison;
      });
    }
    const count = matched.length;
    if (this.limitTo !== null) matched = matched.slice(0, this.limitTo);
    if (this.head) return { data: null, error: null, count };
    if (this.singleMode) {
      const one = matched[0] ?? null;
      if (!one && this.singleMode === "one") {
        return { data: null, error: { message: "No rows found" }, count };
      }
      return { data: one, error: null, count };
    }
    return { data: matched, error: null, count };
  }
}

export type FakeSupabase = {
  client: SupabaseClient;
  db: Tables;
  /** Object paths in the `plan-documents` bucket, as storage would hold them. */
  files: Set<string>;
  /** Auth user ids that still exist. */
  authUsers: Set<string>;
  /** Makes the next write to `table` fail, the way an unmigrated column does. */
  failWriteOnce: (table: string, message: string) => void;
  /** Makes the next storage remove() fail, the way a bucket outage does. */
  failStorageRemoveOnce: (message: string) => void;
};

/** The signed-in user the fake reports. Seed a `profiles` row with this id to give them settings. */
export const FAKE_USER_ID = "user-1";

export function fakeSupabase(
  seed: Tables,
  options?: { files?: string[]; authUsers?: string[] },
): FakeSupabase {
  const db: Tables = structuredClone(seed);
  const files = new Set(options?.files ?? []);
  const authUsers = new Set(options?.authUsers ?? [FAKE_USER_ID]);
  let pending: { table: string; message: string } | null = null;
  let pendingStorage: string | null = null;

  const writeFails = (table: string) => {
    if (pending?.table !== table) return null;
    const { message } = pending;
    pending = null;
    return message;
  };

  /**
   * Enough of the Storage API for account deletion to run against it: a flat
   * set of paths, listed one directory level at a time the way the real
   * client does, with folders reported as entries carrying no id.
   */
  const bucket = () => ({
    download: async () => ({ data: null }),
    list: async (prefix: string, listOptions?: { limit?: number; offset?: number }) => {
      const limit = listOptions?.limit ?? 100;
      const offset = listOptions?.offset ?? 0;
      const base = prefix ? `${prefix}/` : "";

      // name -> is it a file, or a folder standing in for what is beneath it
      const level = new Map<string, boolean>();
      for (const path of files) {
        if (!path.startsWith(base)) continue;
        const rest = path.slice(base.length);
        if (!rest) continue;
        const slash = rest.indexOf("/");
        if (slash === -1) level.set(rest, true);
        else level.set(rest.slice(0, slash), false);
      }

      const entries = [...level.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, isFile]) => ({ name, id: isFile ? `object-${name}` : null }));

      return { data: entries.slice(offset, offset + limit), error: null };
    },
    remove: async (paths: string[]) => {
      if (pendingStorage) {
        const message = pendingStorage;
        pendingStorage = null;
        return { data: null, error: { message } };
      }
      // Reports what it actually deleted, which is what lets the code under
      // test notice a path that did not go.
      const removed = paths.filter((path) => files.delete(path));
      return { data: removed.map((name) => ({ name })), error: null };
    },
  });

  const client = {
    from: (table: string) => new Query(db, table, writeFails),
    // Code under test reads the user's own settings (their timezone, above
    // all) through the client, so the fake has to answer for them too.
    auth: {
      getUser: async () => ({ data: { user: { id: FAKE_USER_ID } }, error: null }),
      signOut: async () => ({ error: null }),
      admin: {
        deleteUser: async (id: string) =>
          authUsers.delete(id)
            ? { data: { user: null }, error: null }
            : { data: null, error: { message: "User not found" } },
      },
    },
    storage: { from: bucket },
  } as unknown as SupabaseClient;

  return {
    client,
    db,
    files,
    authUsers,
    failWriteOnce: (table, message) => {
      pending = { table, message };
    },
    failStorageRemoveOnce: (message) => {
      pendingStorage = message;
    },
  };
}
