import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, FAKE_USER_ID, type FakeSupabase } from "./helpers/fake-supabase";
import { DELETE_PHRASE } from "@/lib/delete-confirmation";

/**
 * Deleting a goal removes its FILES, not only its rows (PRD §23).
 *
 * An earlier report had this route "cleaning up storage". It did read
 * `plan_documents.storage_path` and remove those objects — but that is the
 * paths the application managed to record, not what is in the bucket. An
 * upload whose row insert failed left a file at `<user>/<goal>/<uuid>` that no
 * row pointed at, so nothing would ever remove it and the user could not see
 * it to try. The route now clears the goal's whole prefix, and this is the
 * test that says so.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  SUPABASE_CONFIGURED: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));

const { DELETE } = await import("@/app/api/goals/[id]/route");

const OTHER_USER = "user-2";
const GOAL = "goal-1";
const SIBLING_GOAL = "goal-2";

/** Recorded by a document row. */
const RECORDED = `${FAKE_USER_ID}/${GOAL}/plan.pdf`;
/** In the bucket, recorded nowhere — the upload whose row insert failed. */
const ORPHAN = `${FAKE_USER_ID}/${GOAL}/never-recorded.pdf`;
/** Must survive: another goal of the same user, and another user entirely. */
const SIBLING = `${FAKE_USER_ID}/${SIBLING_GOAL}/other.pdf`;
const THEIRS = `${OTHER_USER}/goal-9/plan.pdf`;

function setup(): FakeSupabase {
  const fake = fakeSupabase(
    {
      goals: [
        { id: GOAL, user_id: FAKE_USER_ID },
        { id: SIBLING_GOAL, user_id: FAKE_USER_ID },
      ],
      plan_documents: [
        { id: "doc-1", user_id: FAKE_USER_ID, goal_id: GOAL, storage_path: RECORDED },
        { id: "doc-2", user_id: FAKE_USER_ID, goal_id: SIBLING_GOAL, storage_path: SIBLING },
      ],
    },
    { files: [RECORDED, ORPHAN, SIBLING, THEIRS], authUsers: [FAKE_USER_ID, OTHER_USER] },
  );
  holder.client = fake.client;
  return fake;
}

function request(confirm: string = DELETE_PHRASE) {
  return new Request("http://localhost/api/goals/goal-1", {
    method: "DELETE",
    body: JSON.stringify({ confirm }),
  });
}

const params = (id = GOAL) => ({ params: Promise.resolve({ id }) });

describe("deleting a goal", () => {
  it("leaves no object under that goal's prefix", async () => {
    const fake = setup();

    const response = await DELETE(request(), params());

    expect(response.status).toBe(200);
    const remaining = [...fake.files].filter((path) =>
      path.startsWith(`${FAKE_USER_ID}/${GOAL}/`),
    );
    expect(remaining).toEqual([]);
  });

  it("removes the file no row pointed at", async () => {
    const fake = setup();

    await DELETE(request(), params());

    expect(fake.files.has(ORPHAN)).toBe(false);
    expect(fake.files.has(RECORDED)).toBe(false);
  });

  it("touches no other goal and no other account", async () => {
    const fake = setup();

    await DELETE(request(), params());

    expect(fake.files.has(SIBLING)).toBe(true);
    expect(fake.files.has(THEIRS)).toBe(true);
    expect(fake.db.goals?.map((row) => row.id)).toEqual([SIBLING_GOAL]);
  });

  it("reports how many files went", async () => {
    const fake = setup();

    const response = await DELETE(request(), params());
    const payload = (await response.json()) as { deleted: string; files_removed: number };

    expect(payload.deleted).toBe(GOAL);
    expect(payload.files_removed).toBe(2);
    expect(fake.files.size).toBe(2);
  });
});

describe("a goal deletion that cannot finish", () => {
  it("keeps the rows when the objects could not be removed", async () => {
    const fake = setup();
    fake.failStorageRemoveOnce("service unavailable");

    const response = await DELETE(request(), params());
    const payload = (await response.json()) as { error: string; files_removed: number };

    expect(response.status).toBe(502);
    expect(payload.error).toContain("service unavailable");
    expect(payload.files_removed).toBe(0);
    // The goal is still there, so the files still have something pointing at
    // them and the user can try again.
    expect(fake.db.goals?.map((row) => row.id)).toEqual([GOAL, SIBLING_GOAL]);
    expect(fake.files.has(RECORDED)).toBe(true);
  });

  it("refuses without the typed phrase, and deletes nothing", async () => {
    const fake = setup();

    const response = await DELETE(request("delete"), params());

    expect(response.status).toBe(400);
    expect(fake.files.has(RECORDED)).toBe(true);
    expect(fake.db.goals).toHaveLength(2);
  });

  it("is a 404 for a goal that is not there", async () => {
    const fake = setup();

    const response = await DELETE(request(), params("goal-does-not-exist"));

    expect(response.status).toBe(404);
    expect(fake.files.size).toBe(4);
  });
});
