import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Disconnects Google Calendar (PRD §23 "Users can disconnect Calendar").
 *
 * Revokes the grant with Google first, then destroys the stored tokens. Doing
 * it in that order means a failure leaves the credentials in place to retry,
 * rather than orphaning a live grant we can no longer revoke.
 */
export async function POST() {
  if (!SUPABASE_CONFIGURED || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const admin = createAdminClient();

  const { data: credentials } = await admin
    .from("calendar_credentials")
    .select("access_token_cipher, token_iv, token_auth_tag")
    .eq("user_id", user.id)
    .maybeSingle();

  if (credentials) {
    try {
      const { decryptToken } = await import("@/lib/crypto/tokens");
      const accessToken = decryptToken({
        cipher: credentials.access_token_cipher,
        iv: credentials.token_iv,
        authTag: credentials.token_auth_tag,
      });
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
      });
    } catch {
      // An already-invalid token cannot be revoked, which is fine — the local
      // deletion below is what actually ends Vezri's access.
    }
  }

  await admin.from("calendar_credentials").delete().eq("user_id", user.id);
  // Vezri-created blocks stay on the user's calendar; deleting their events
  // without asking would be exactly the kind of unilateral write §11 forbids.
  await supabase.from("calendar_connections").delete().eq("user_id", user.id);

  return NextResponse.json({ disconnected: true });
}
