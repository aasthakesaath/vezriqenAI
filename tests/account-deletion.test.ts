import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AccountDeletionError,
  DELETION_ORDER,
  collectStoredPaths,
  deleteAccount,
  ownerColumn,
} from "@/lib/account/delete";
import { confirmsDeletion, DELETE_PHRASE } from "@/lib/delete-confirmation";
import { EXPECTED_TABLES } from "@/lib/db/schema-manifest";
import { fakeSupabase, FAKE_USER_ID, type Tables } from "./helpers/fake-supabase";

/**
 * Account deletion (PRD §23), which /privacy and /terms promise in as many
 * words: "you can delete your account, which removes your plans, goals,
 * execution history, and stored tokens."
 *
 * The claim under test is the whole of that promise — no row for the user in
 * ANY table, and no file left in the bucket. It is asserted against every
 * table the migrations create, read from the schema manifest rather than a
 * list typed out here, so a table added in a later milestone and forgotten by
 * the sweep fails this test instead of quietly outliving the account.
 */

const OTHER_USER = "user-2";

/** A row for each user in every table, keyed the way that table keys its owner. */
function seedEveryTable(): Tables {
  const db: Tables = {};
  for (const table of EXPECTED_TABLES) {
    const column = ownerColumn(table);
    db[table] = [
      { ...(column === "id" ? { id: FAKE_USER_ID } : { id: `${table}-mine`, user_id: FAKE_USER_ID }) },
      { ...(column === "id" ? { id: OTHER_USER } : { id: `${table}-theirs`, user_id: OTHER_USER }) },
    ];
  }
  // The documents the sweep reads to find stored objects.
  db.plan_documents = [
    { id: "doc-mine", user_id: FAKE_USER_ID, storage_path: `${FAKE_USER_ID}/goal-1/plan.pdf` },
    { id: "doc-theirs", user_id: OTHER_USER, storage_path: `${OTHER_USER}/goal-9/plan.pdf` },
  ];
  return db;
}

const MY_FILES = [
  `${FAKE_USER_ID}/goal-1/plan.pdf`,
  `${FAKE_USER_ID}/goal-1/appendix.docx`,
  `${FAKE_USER_ID}/goal-2/schedule.png`,
];
const THEIR_FILES = [`${OTHER_USER}/goal-9/plan.pdf`];

function setup() {
  return fakeSupabase(seedEveryTable(), {
    files: [...MY_FILES, ...THEIR_FILES],
    authUsers: [FAKE_USER_ID, OTHER_USER],
  });
}

describe("the sweep knows about every table", () => {
  it("covers exactly the tables the migrations create", () => {
    // Set equality both ways. A missing table would leave rows behind; an
    // extra one would be a table that no longer exists.
    expect([...DELETION_ORDER].sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it("keys profiles by id and everything else by user_id", () => {
    expect(ownerColumn("profiles")).toBe("id");
    for (const table of DELETION_ORDER) {
      if (table === "profiles") continue;
      expect(ownerColumn(table), `${table} is keyed by user_id`).toBe("user_id");
    }
  });
});

describe("deleting an account", () => {
  it("leaves no row for that user in any table", async () => {
    const fake = setup();

    await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });

    const survivors: string[] = [];
    for (const table of EXPECTED_TABLES) {
      const column = ownerColumn(table);
      for (const row of fake.db[table] ?? []) {
        if (row[column] === FAKE_USER_ID) survivors.push(`${table}.${column}`);
      }
    }
    expect(survivors).toEqual([]);
  });

  it("leaves every other account exactly as it was", async () => {
    const fake = setup();

    await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });

    for (const table of EXPECTED_TABLES) {
      const column = ownerColumn(table);
      const theirs = (fake.db[table] ?? []).filter((row) => row[column] === OTHER_USER);
      expect(theirs, `${table} should still hold the other user's row`).toHaveLength(1);
    }
    expect([...fake.files]).toEqual(THEIR_FILES);
    expect(fake.authUsers.has(OTHER_USER)).toBe(true);
  });

  it("leaves no object under that account's prefix", async () => {
    const fake = setup();

    await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });

    const remaining = [...fake.files].filter((path) => path.startsWith(`${FAKE_USER_ID}/`));
    expect(remaining).toEqual([]);
  });

  it("removes the uploaded files, not only the rows that point at them", async () => {
    const fake = setup();

    const result = await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });

    expect(result.filesRemoved).toBe(MY_FILES.length);
    for (const path of MY_FILES) {
      expect(fake.files.has(path), `${path} should be gone from the bucket`).toBe(false);
    }
  });

  it("removes an object no row knows about", async () => {
    // An upload whose row insert failed exists only in the bucket. It is still
    // this person's file, so the promise covers it.
    const orphan = `${FAKE_USER_ID}/goal-3/never-recorded.pdf`;
    const fake = fakeSupabase(seedEveryTable(), {
      files: [...MY_FILES, ...THEIR_FILES, orphan],
      authUsers: [FAKE_USER_ID, OTHER_USER],
    });

    await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });

    expect(fake.files.has(orphan)).toBe(false);
  });

  it("deletes the auth user, so signing in again starts fresh", async () => {
    const fake = setup();

    await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });

    expect(fake.authUsers.has(FAKE_USER_ID)).toBe(false);
  });

  it("never touches an object outside the user's own folder", async () => {
    // A storage_path that points somewhere else must not become a way to
    // delete another account's file, however it got into the row.
    const db = seedEveryTable();
    db.plan_documents = [
      { id: "doc-mine", user_id: FAKE_USER_ID, storage_path: `${OTHER_USER}/goal-9/plan.pdf` },
    ];
    const fake = fakeSupabase(db, {
      files: [...MY_FILES, ...THEIR_FILES],
      authUsers: [FAKE_USER_ID, OTHER_USER],
    });

    const paths = await collectStoredPaths({ admin: fake.client, userId: FAKE_USER_ID });

    expect(paths).toEqual([...MY_FILES].sort());
    await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });
    expect([...fake.files]).toEqual(THEIR_FILES);
  });
});

describe("when the bucket fails partway", () => {
  it("stops before deleting a single row or the auth user", async () => {
    const fake = setup();
    fake.failStorageRemoveOnce("service unavailable");

    await expect(deleteAccount({ admin: fake.client, userId: FAKE_USER_ID })).rejects.toThrow(
      AccountDeletionError,
    );

    // The account is intact, so the files still have an owner and the person
    // can try again. That is the whole reason storage goes first.
    for (const table of EXPECTED_TABLES) {
      const column = ownerColumn(table);
      const mine = (fake.db[table] ?? []).filter((row) => row[column] === FAKE_USER_ID);
      expect(mine, `${table} should be untouched`).not.toHaveLength(0);
    }
    expect(fake.authUsers.has(FAKE_USER_ID)).toBe(true);
  });

  it("says which stage failed and how many files went", async () => {
    const fake = setup();
    fake.failStorageRemoveOnce("service unavailable");

    let thrown: unknown;
    try {
      await deleteAccount({ admin: fake.client, userId: FAKE_USER_ID });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AccountDeletionError);
    const error = thrown as AccountDeletionError;
    expect(error.stage).toBe("storage");
    expect(error.filesRemoved).toBe(0);
    expect(error.message).toContain("service unavailable");
  });
});

describe("the typed confirmation", () => {
  it("accepts the phrase, with surrounding space", () => {
    expect(confirmsDeletion(DELETE_PHRASE)).toBe(true);
    expect(confirmsDeletion(`  ${DELETE_PHRASE} `)).toBe(true);
  });

  it("refuses anything else, including the wrong case", () => {
    for (const input of ["delete", "Delete", "DELETE ACCOUNT", "", "  ", null, undefined, 1]) {
      expect(confirmsDeletion(input), `${String(input)} must not confirm`).toBe(false);
    }
  });
});

describe("storage goes through the Storage API, never SQL", () => {
  /**
   * Supabase installs `storage.protect_delete()` on `storage.objects`, so a
   * `delete from storage.objects` raises 42501 — "Use the Storage API
   * instead." A sweep written as SQL would typecheck, pass review, and then
   * fail at runtime on the one operation that has to work.
   *
   * Listing has the same shape of answer: the paths come from the bucket's own
   * list(), not from a query against the storage schema.
   */
  const sweep = readFileSync("src/lib/storage/plan-documents.ts", "utf8");
  const account = readFileSync("src/lib/account/delete.ts", "utf8");
  const goalRoute = readFileSync("src/app/api/goals/[id]/route.ts", "utf8");

  it("lists and removes through the bucket client", () => {
    expect(sweep).toContain("client.storage.from(PLAN_DOCUMENTS_BUCKET)");
    expect(sweep).toContain("bucket.list(");
    expect(sweep).toContain("bucket.remove(");
  });

  it("never queries the storage schema as a table", () => {
    for (const [name, source] of [
      ["the sweep", sweep],
      ["account deletion", account],
      ["the goal route", goalRoute],
    ] as const) {
      // `.from("storage.objects")` in any quoting, which is the form that
      // would reach Postgres instead of the Storage API.
      expect(source, `${name} must not query storage.objects`).not.toMatch(
        /\.from\(\s*["'`]storage\./,
      );
    }
  });

  it("sweeps only public tables, so no delete lands on storage.objects", () => {
    for (const table of DELETION_ORDER) {
      expect(table).not.toContain("storage");
      expect(table).not.toContain(".");
    }
  });
});
