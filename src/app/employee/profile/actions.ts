"use server";
import { createClient } from "@/lib/supabase/server";
export type ActionState = { error?: string; success?: string };
export async function changePassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const pw = String(fd.get("password") || "");
  const confirm = String(fd.get("confirm") || "");
  if (pw.length < 6) return { error: "Password must be at least 6 characters." };
  if (pw !== confirm) return { error: "Passwords do not match." };
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: error.message };
  return { success: "Password updated." };
}
