import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request and keeps cookies in sync.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Performance: getSession() reads the session from the cookie locally and only calls Supabase
  // when the access token has expired (it then refreshes it and setAll() writes the new cookies).
  // getUser() made a network round-trip to Supabase Auth on EVERY navigation and prefetch.
  // Authorization does not rely on this call: getSessionProfile() (src/lib/auth.ts) loads the
  // profile through PostgREST with the user's JWT, which verifies the token's signature, so a
  // forged or invalid cookie still gets no profile and is redirected to /login.
  await supabase.auth.getSession();
  return response;
}
