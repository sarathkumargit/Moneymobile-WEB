"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/lib/auth/auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Enter your email and password")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // A deactivated employee is also blocked at the login service ("banned"): keep the clear message.
    const msg = /banned/i.test(error.message) ? "Your account is disabled" : "Invalid email or password";
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let dest = "/employee";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();
    if (profile?.status === "disabled") {
      await supabase.auth.signOut();
      redirect(`/login?error=${encodeURIComponent("Your account is disabled")}`);
    }
    dest = dashboardPath(profile?.role);
  }
  redirect(dest);
}
