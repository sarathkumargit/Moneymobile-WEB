import "server-only";

// The phone's model + IMEI, copied onto agreements and payments when they are created
// (migration 0016), so history keeps naming the phone after it is reset for resale or deleted.
export type DeviceSnapshot = { device_model: string | null; device_imei: string | null };

// Accepts either the staff (RLS) client or the service client.
type Client = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function deviceSnapshot(client: Client, deviceId: string | null | undefined): Promise<DeviceSnapshot> {
  if (!deviceId) return { device_model: null, device_imei: null };
  const { data } = await client.from("devices").select("brand,model,imei1").eq("id", deviceId).maybeSingle();
  const d = data as { brand: string | null; model: string | null; imei1: string | null } | null;
  return {
    device_model: d ? [d.brand, d.model].filter(Boolean).join(" ") || null : null,
    device_imei: d?.imei1 ?? null,
  };
}

/** "Samsung SM-A045F · 353263210632193", or "—". */
export function deviceLabel(model?: string | null, imei?: string | null) {
  return [model, imei].filter(Boolean).join(" · ") || "—";
}

/** True when a write failed only because migration 0016 hasn't been run yet. */
export function missingSnapshotColumn(err: { message?: string } | null | undefined) {
  return !!err?.message && /device_(model|imei)/.test(err.message);
}

/**
 * Phone label ("model · IMEI") per agreement id, for list pages. Uses the saved copy on the
 * agreement (migration 0016) and falls back to the phone it is linked to — works before 0016 too.
 */
export async function phoneLabelsForAgreements(client: Client, agreementIds: (string | null | undefined)[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(agreementIds.filter((x): x is string => !!x)));
  if (!ids.length) return {};
  type A = { id: string; device_id: string | null; device_model?: string | null; device_imei?: string | null };
  let { data, error } = await client.from("installment_agreements").select("id,device_id,device_model,device_imei").in("id", ids);
  if (error) ({ data } = await client.from("installment_agreements").select("id,device_id").in("id", ids));
  const agrs = (data ?? []) as A[];
  const devIds = agrs.filter((a) => !a.device_imei && a.device_id).map((a) => a.device_id as string);
  const devs: Record<string, { brand: string | null; model: string | null; imei1: string | null }> = {};
  if (devIds.length) {
    const { data: d } = await client.from("devices").select("id,brand,model,imei1").in("id", devIds);
    for (const x of (d ?? []) as Array<{ id: string; brand: string | null; model: string | null; imei1: string | null }>) devs[x.id] = x;
  }
  const out: Record<string, string> = {};
  for (const a of agrs) {
    const d = a.device_id ? devs[a.device_id] : undefined;
    out[a.id] = a.device_imei || a.device_model
      ? deviceLabel(a.device_model, a.device_imei)
      : deviceLabel(d ? [d.brand, d.model].filter(Boolean).join(" ") : null, d?.imei1);
  }
  return out;
}

/** Newest payments with their saved phone (falls back to the old columns before migration 0016). */
export async function loadPayments(client: Client, customerEmbed: string, limit = 200) {
  const base = "id,agreement_id,amount,method,reference,paid_at,verification";
  const q = (cols: string) => client.from("payment_transactions").select(`${cols}, ${customerEmbed}`).order("paid_at", { ascending: false }).limit(limit);
  const res = await q(`${base},device_model,device_imei`);
  return res.error ? await q(base) : res;
}
