export const runtime = "nodejs";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// A phone reports how its setup went (app 1.10.8+): see supabase/migrations/0022_setup_reports.sql.
// Sent during QR setup — before the phone is registered — so it authenticates with the shop id +
// enroll secret from the QR / setup file, like /api/devices/auto-enroll. Stores text only; never
// changes a device, enrollment or agreement.

const STAGES = new Set(["provisioning", "crash", "enrolled"]);
const MAX_REPORTS_PER_SHOP_PER_HOUR = 60; // a misbehaving phone can't flood the table

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return Response.json({ success: false, message: "Bad request" }, { status: 400 });

  const shopId = String(b.shop_id ?? "").trim();
  const secret = String(b.enroll_secret ?? "").trim();
  const stage = String(b.stage ?? "");
  if (!shopId || !secret || !STAGES.has(stage)) return Response.json({ success: false, message: "Bad request" }, { status: 400 });

  const admin = createAdminClient();
  const { data: shop, error: shopErr } = await admin.from("shops").select("id,enroll_secret").eq("id", shopId).maybeSingle();
  if (shopErr) return Response.json({ success: false }, { status: 503 });
  if (!shop?.enroll_secret || !sameSecret(String(shop.enroll_secret), secret)) {
    return Response.json({ success: false, message: "Not valid for this shop" }, { status: 401 });
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("device_setup_reports").select("id", { count: "exact", head: true })
    .eq("shop_id", shopId).gte("created_at", since);
  if ((count ?? 0) >= MAX_REPORTS_PER_SHOP_PER_HOUR) return Response.json({ success: false, message: "Too many reports" }, { status: 429 });

  const { error } = await admin.from("device_setup_reports").insert({
    shop_id: shopId,
    stage,
    brand: text(b.brand, 60),
    model: text(b.model, 80),
    android_version: text(b.android_version, 20),
    sdk_int: Number.isInteger(b.sdk_int) ? b.sdk_int : null,
    app_version: text(b.app_version, 20),
    device_owner: b.device_owner === true,
    enrolled: b.enrolled === true,
    imei_readable: b.imei_readable === true,
    steps: text(b.steps, 4000),
    crash: text(b.crash, 3000),
  });
  // 503 (not 4xx) when the table is missing, so the phone retries a few times after migration 0022 is run.
  if (error) return Response.json({ success: false }, { status: 503 });
  return Response.json({ success: true });
}
