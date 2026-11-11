import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Matching a registered phone to its phone record by IMEI (either slot), and linking the two.
//
//  - findOrClaimDevice(): the platform registry (migration 0023 claim_device) knows every IMEI of a phone, so
//    IMEI1 or IMEI2 finds the same record. Without 0023 it falls back to a direct imei1/imei2 search.
//  - linkEnrollment(): migration 0030 link_enrollment_to_device — one transaction that links the phone, retires
//    unused old registrations of that record and fills in the customer + agreement.

/** Digits only; keeps 14–16 digit values (IMEI / IMEISV), else null. */
export function cleanImei(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 14 && d.length <= 16 ? d : null;
}

export function imeiList(...vals: unknown[]): string[] {
  return Array.from(new Set(vals.map(cleanImei).filter((x): x is string => !!x)));
}

export type ClaimResult = { deviceId: string | null; conflict?: boolean };

/** Finds this shop's phone record for these IMEIs, creating one (in stock) when the phone is new. */
export async function findOrClaimDevice(admin: Admin, shopId: string, imeis: string[], info: { brand?: string | null; model?: string | null; serial?: string | null }): Promise<ClaimResult> {
  if (!imeis.length) return { deviceId: null };
  const { data, error } = await admin.rpc("claim_device", {
    p_shop_id: shopId, p_imeis: imeis, p_serial: info.serial ?? null, p_brand: info.brand ?? null, p_model: info.model ?? null,
  });
  if (!error && data) {
    const r = data as { result?: string; device_id?: string | null };
    if (r.result === "conflict") return { deviceId: null, conflict: true };
    if (r.device_id) return { deviceId: r.device_id };
  } else if (error) {
    console.warn("[imei-link] claim_device unavailable, using direct IMEI search:", error.message);
  }
  // Fallback (registry not installed): direct search on both IMEI columns.
  const list = imeis.map((x) => `"${x}"`).join(",");
  const { data: found } = await admin.from("devices").select("id,imei2")
    .eq("shop_id", shopId).or(`imei1.in.(${list}),imei2.in.(${list})`)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (found) {
    const patch: Record<string, unknown> = { enrollment: "enrolled" };
    if (info.brand) patch.brand = info.brand;
    if (info.model) patch.model = info.model;
    await admin.from("devices").update(patch).eq("id", found.id);
    if (!found.imei2 && imeis[1]) await admin.from("devices").update({ imei2: imeis[1] }).eq("id", found.id);
    return { deviceId: found.id as string };
  }
  const { data: created } = await admin.from("devices").insert({
    shop_id: shopId, brand: info.brand ?? null, model: info.model ?? null, imei1: imeis[0], imei2: imeis[1] ?? null,
    serial_number: info.serial ?? null, status: "in_stock", enrollment: "enrolled",
  }).select("id").single();
  return { deviceId: (created?.id as string) ?? null };
}

export type LinkResult = { ok: boolean; code?: string; error?: string; agreementId?: string | null; customerId?: string | null; retired?: number; missing?: boolean };

/** Links a registered phone to a phone record (migration 0030). Never throws. */
export async function linkEnrollment(admin: Admin, enrollmentId: string, deviceId: string, opts: { actor?: string | null; source: string; force?: boolean }): Promise<LinkResult> {
  const { data, error } = await admin.rpc("link_enrollment_to_device", {
    p_enrollment: enrollmentId, p_device: deviceId, p_actor: opts.actor ?? null, p_source: opts.source, p_force: !!opts.force,
  });
  if (error) {
    const missing = /link_enrollment_to_device|does not exist|schema cache/i.test(error.message);
    return { ok: false, missing, error: missing ? "Run migration 0030_device_linking.sql in Supabase first." : error.message };
  }
  const r = (data ?? {}) as { ok?: boolean; code?: string; error?: string; agreement_id?: string | null; customer_id?: string | null; retired?: number };
  return { ok: !!r.ok, code: r.code, error: r.error, agreementId: r.agreement_id ?? null, customerId: r.customer_id ?? null, retired: r.retired };
}

/**
 * A phone that checks in without a phone record (it registered with no readable IMEI — e.g. a Xiaomi set up
 * before app 1.11.4): match it by the IMEIs it now reports and link it. Returns the fresh link fields, or null.
 */
export async function autoLinkOrphan(
  admin: Admin,
  enr: { id: string; shop_id: string; device_id: string | null; model?: string | null; manufacturer?: string | null; serial_number?: string | null },
  reported: unknown[],
): Promise<{ device_id: string; customer_id: string | null; agreement_id: string | null } | null> {
  if (enr.device_id) return null;
  const imeis = imeiList(...reported);
  if (!imeis.length) return null;
  const claim = await findOrClaimDevice(admin, enr.shop_id, imeis, { brand: enr.manufacturer ?? null, model: enr.model ?? null, serial: enr.serial_number ?? null });
  if (!claim.deviceId) return null;
  const r = await linkEnrollment(admin, enr.id, claim.deviceId, { source: "auto_checkin" });
  if (!r.ok) { console.warn("[imei-link] auto link skipped:", r.code ?? "", r.error ?? ""); return null; }
  const { data } = await admin.from("device_enrollments").select("device_id,customer_id,agreement_id").eq("id", enr.id).maybeSingle();
  return data ? { device_id: data.device_id as string, customer_id: (data.customer_id as string) ?? null, agreement_id: (data.agreement_id as string) ?? null } : null;
}
