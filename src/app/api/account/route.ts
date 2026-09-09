import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfigurationError, SUPABASE_CONFIGURED } from "@/lib/env";
import { confirmsDeletion, DELETE_PHRASE } from "@/lib/delete-confirmation";
import { AccountDeletionError, deleteAccount } from "@/lib/account/delete";

export const runtime = "nodejs";

/**
 * Delete the signed-in account (PRD §23), which /privacy and /terms promise.
 *
 * Three gates, and all three are here rather than in the control: the session
 * says who is asking, the typed phrase says they meant it, and the user id
 * comes from `getUser()` — never from the request body, so this endpoint has
 * no shape in which it could delete somebody else.
 *
 * The work itself runs on the service role. See lib/account/delete.ts for why
 * a user session cannot do it.
 */
const Body = z.object({ confirm: z.string() }).strict();

export async function DELETE(request: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !confirmsDeletion(parsed.data.confirm)) {
    return NextResponse.json(
      { error: `Type ${DELETE_PHRASE} to confirm.` },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    // Deleting the auth user needs the service role key. Without it the honest
    // answer is that this environment cannot do it — not a partial delete that
    // leaves the sign-in working and the account apparently gone.
    if (error instanceof ConfigurationError) {
      return NextResponse.json(
        { error: "Account deletion isn't available in this environment yet." },
        { status: 503 },
      );
    }
    throw error;
  }

  try {
    const result = await deleteAccount({ admin, userId: user.id });
    // Local only: the user this token belongs to no longer exists, so asking
    // the auth server to revoke it would fail. This clears the cookies, which
    // is the part that still matters.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return NextResponse.json({ deleted: true, ...result });
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      // Said plainly, including what did happen. "Something went wrong" after
      // a confirmed deletion leaves someone unable to tell whether their
      // documents are gone.
      return NextResponse.json(
        { error: error.message, stage: error.stage, files_removed: error.filesRemoved },
        { status: 502 },
      );
    }
    throw error;
  }
}
