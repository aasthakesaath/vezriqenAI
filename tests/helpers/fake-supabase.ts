import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A small in-memory stand-in for the PostgREST query builder.
 *
 * Enough of the surface that src/lib/plan/build.ts runs against it unchanged:
 * select/insert/update/delete, eq, order, limit, single/maybeSingle, and head
 * counts. It exists so resumption can be tested for what it actually claims —
 * that a second attempt does not re-run the passes that already landed —
 * rather than against a hand-written double of the code under test.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

type Op = "select" | "insert" | "update" | "delete";
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
    return all.filter((row) => this.filters.every(([column, value]) => row[column] === value));
  }

  private run(): Result {
    if (this.op !== "select") {
      const failure = this.writeFails(this.table);
      if (failure) return { data: null, error: { message: failure } };
    }

    if (this.op === "insert") {
      const inserted = this.payload.map((row) => ({
        id: `id-${nextId++}`,
        created_at: new Date(Date.now() + nextId).toISOString(),
        ...row,
      }));
      (this.db[this.table] ??= []).push(...inserted);
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
  /** Makes the next write to `table` fail, the way an unmigrated column does. */
  failWriteOnce: (table: string, message: string) => void;
};

/** The signed-in user the fake reports. Seed a `profiles` row with this id to give them settings. */
export const FAKE_USER_ID = "user-1";

export function fakeSupabase(seed: Tables): FakeSupabase {
  const db: Tables = structuredClone(seed);
  let pending: { table: string; message: string } | null = null;

  const writeFails = (table: string) => {
    if (pending?.table !== table) return null;
    const { message } = pending;
    pending = null;
    return message;
  };

  const client = {
    from: (table: string) => new Query(db, table, writeFails),
    // Code under test reads the user's own settings (their timezone, above
    // all) through the client, so the fake has to answer for them too.
    auth: { getUser: async () => ({ data: { user: { id: FAKE_USER_ID } }, error: null }) },
    storage: { from: () => ({ download: async () => ({ data: null }) }) },
  } as unknown as SupabaseClient;

  return {
    client,
    db,
    failWriteOnce: (table, message) => {
      pending = { table, message };
    },
  };
}
