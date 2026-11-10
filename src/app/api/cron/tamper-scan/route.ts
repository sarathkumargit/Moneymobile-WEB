export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanSilentPhones } from "@/lib/devices/tamper";

// Daily tamper scan (vercel.json "crons"): raises "no check-in for 2 / 7 days" alerts for phones that still
// owe money. Vercel calls it with "Authorization: Bearer <CRON_SECRET>" — set CRON_SECRET in the Vercel
// project's environment variables. The Tamper Alerts page also runs the same scan when staff open it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, message: "Set CRON_SECRET to enable the daily scan" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false }, { status: 401 });
  const alerts = await scanSilentPhones(createAdminClient(), null);
  return Response.json({ ok: true, alerts });
}
