import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/shared/nav";

export type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  role: Role;
  shop_id: string | null;
  status: string;
};

// Returns the signed-in user + their profile, or null if not authenticated.
//
// Performance: the middleware (src/lib/supabase/middleware.ts) refreshes the session cookie
// on every request, so here we read that session locally with getSession() (no network
// round-trip to Supabase Auth). The token is still verified: the profile query below goes
// through PostgREST with the user's JWT, which rejects an invalid or forged token.
//
// Wrapped in React cache() so that multiple server components / calls within a single
// request share one result (one profile query per request, not one per caller).
export const getSessionProfile = cache(async () => {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user || !session) return null;
  // session.user is plain JSON from the cookie and is not signed, so a user could edit it.
  // The access token IS signed: take the identity from its `sub` claim and require it to match.
  // The profile query below sends this same token to PostgREST, which verifies the signature
  // and expiry — so the id we look up is guaranteed to belong to whoever holds a valid token.
  if (jwtSub(session.access_token) !== user.id) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, shop_id, status")
    .eq("id", user.id)
    .single();

  // No profile means the JWT was rejected by PostgREST (invalid/forged) or the account is gone.
  // Disabled accounts are treated as signed out on every request, not only at login.
  if (!profile || profile.status === "disabled") return null;
  return { user, profile: profile as Profile };
});

function jwtSub(token: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function dashboardPath(role?: string | null) {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "shop_admin":
      return "/shop";
    default:
      return "/employee";
  }
}
