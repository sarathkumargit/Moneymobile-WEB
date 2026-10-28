import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Uses the service-role key to perform privileged operations
// (creating auth users, writing across shops). Never import this in a Client
// Component or expose the key to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
