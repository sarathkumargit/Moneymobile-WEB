import "server-only";

// Phone-model risk (anti-unlock plan, Phase 1).
//
// The shop tests each model with its own unlock / flash tools (Unlock Tests page). The result per model:
//   safe         every core attack was tried recently and the protection held
//   risky        some attacks tried and held, others not tried yet (or the "held" results are old)
//   untested     no tests at all
//   not_allowed  at least one attack's MOST RECENT result was "bypassed" — the tools beat this model
// A super admin can set a platform verdict per model (applies to every shop). The stricter result wins
// when the shop's own tests show a bypass. Migration 0025 holds the tables; without it every model is
// "untested" and nothing is blocked.

export type RiskLevel = "safe" | "risky" | "untested" | "not_allowed";
export type TestMethod = "recovery_reset" | "frp_tool" | "firmware_flash" | "mdm_tool" | "other";
export type TestResult = "held" | "bypassed";

export const METHOD_LABEL: Record<TestMethod, string> = {
  recovery_reset: "Power + Volume reset",
  frp_tool: "FRP unlock tool",
  firmware_flash: "Firmware flash",
  mdm_tool: "MDM / lock remover",
  other: "Other",
};

/** The three attacks a model must survive to count as safe. */
export const CORE_METHODS: TestMethod[] = ["recovery_reset", "frp_tool", "firmware_flash"];

/** A "held" result older than this no longer counts (new tools and firmware appear all the time). */
export const HELD_VALID_DAYS = 180;

export const RISK_META: Record<RiskLevel, { label: string; badge: "success" | "warning" | "danger" | "neutral"; minDepositPct: number | null; maxMonths: number | null; hint: string }> = {
  safe:        { label: "Safe",        badge: "success", minDepositPct: 20,   maxMonths: 12,   hint: "Tested: the unlock tools could not beat this model." },
  risky:       { label: "Risky",       badge: "warning", minDepositPct: 40,   maxMonths: 6,    hint: "Only partly tested. Use a bigger down payment and a shorter term." },
  untested:    { label: "Untested",    badge: "neutral", minDepositPct: 40,   maxMonths: 6,    hint: "No unlock test recorded yet. Test one phone of this model on the Unlock Tests page." },
  not_allowed: { label: "Not allowed", badge: "danger",  minDepositPct: null, maxMonths: null, hint: "The unlock tools beat this model. Only the shop owner can finance it, with a written reason." },
};

/** "Samsung", "SM-M175F" -> "samsung|sm-m175f" (same rule as the database column). */
export function modelKey(brand: string | null | undefined, model: string | null | undefined): string | null {
  const b = (brand ?? "").replace(/\s/g, "").toLowerCase();
  const m = (model ?? "").replace(/\s/g, "").toLowerCase();
  if (!b || !m) return null;
  return `${b}|${m}`;
}

export type TestRow = { model_key: string; method: TestMethod; result: TestResult; tested_at: string };
export type VerdictRow = { model_key: string; verdict: Exclude<RiskLevel, "untested">; reason: string | null };
export type ModelRisk = { level: RiskLevel; label: string; reasons: string[]; minDepositPct: number | null; maxMonths: number | null; tested: number };

/** Pure: risk from one model's tests (any order) and an optional platform verdict. */
export function computeRisk(tests: TestRow[], verdict?: VerdictRow | null, now = Date.now()): ModelRisk {
  const latest = new Map<TestMethod, TestRow>();
  for (const t of tests) {
    const cur = latest.get(t.method);
    if (!cur || new Date(t.tested_at).getTime() > new Date(cur.tested_at).getTime()) latest.set(t.method, t);
  }
  const reasons: string[] = [];
  let shopLevel: RiskLevel;
  const bypassed = Array.from(latest.values()).filter((t) => t.result === "bypassed");
  if (bypassed.length) {
    shopLevel = "not_allowed";
    for (const t of bypassed) reasons.push(`${METHOD_LABEL[t.method]}: bypassed`);
  } else if (!tests.length) {
    shopLevel = "untested";
  } else {
    const fresh = (t?: TestRow) => !!t && t.result === "held" && now - new Date(t.tested_at).getTime() <= HELD_VALID_DAYS * 86400000;
    const missing = CORE_METHODS.filter((m) => !fresh(latest.get(m)));
    shopLevel = missing.length ? "risky" : "safe";
    for (const m of missing) reasons.push(latest.get(m) ? `${METHOD_LABEL[m]}: test is older than ${HELD_VALID_DAYS} days` : `${METHOD_LABEL[m]}: not tested`);
  }

  let level = shopLevel;
  if (verdict && shopLevel !== "not_allowed") {
    level = verdict.verdict;
    reasons.unshift(`Platform verdict: ${RISK_META[verdict.verdict].label}${verdict.reason ? ` — ${verdict.reason}` : ""}`);
  }
  const meta = RISK_META[level];
  return { level, label: meta.label, reasons, minDepositPct: meta.minDepositPct, maxMonths: meta.maxMonths, tested: tests.length };
}

type Client = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Risk per model key for one shop. Uses the shop's own tests + the platform verdicts.
 * Never throws: if migration 0025 has not been run, every model comes back "untested".
 */
export async function risksForModels(client: Client, shopId: string | null, keys: (string | null)[]): Promise<Record<string, ModelRisk>> {
  const uniq = Array.from(new Set(keys.filter((k): k is string => !!k)));
  const out: Record<string, ModelRisk> = {};
  if (!uniq.length) return out;
  let tests: TestRow[] = [];
  let verdicts: VerdictRow[] = [];
  try {
    const [tr, vr] = await Promise.all([
      shopId
        ? client.from("model_protection_tests").select("model_key,method,result,tested_at").eq("shop_id", shopId).in("model_key", uniq)
        : Promise.resolve({ data: [], error: null }),
      client.from("model_protection_verdicts").select("model_key,verdict,reason").in("model_key", uniq),
    ]);
    if (!tr.error) tests = (tr.data ?? []) as TestRow[];
    if (!vr.error) verdicts = (vr.data ?? []) as VerdictRow[];
  } catch { /* migration 0025 not run: everything untested */ }
  for (const k of uniq) {
    out[k] = computeRisk(tests.filter((t) => t.model_key === k), verdicts.find((v) => v.model_key === k) ?? null);
  }
  return out;
}

/** Risk for one device row (brand + model as stored on the device). */
export async function riskForDevice(client: Client, shopId: string, deviceId: string): Promise<{ key: string | null; brand: string | null; model: string | null; risk: ModelRisk }> {
  const { data } = await client.from("devices").select("brand,model").eq("id", deviceId).maybeSingle();
  const d = data as { brand: string | null; model: string | null } | null;
  const key = modelKey(d?.brand, d?.model);
  const map = await risksForModels(client, shopId, [key]);
  return { key, brand: d?.brand ?? null, model: d?.model ?? null, risk: key ? map[key] : computeRisk([]) };
}

export type DeviceRisk = { level: RiskLevel; label: string; hint: string; reasons: string[]; minDepositPct: number | null; maxMonths: number | null };

/** Adds `risk` to device dropdown options (for the agreement form). Never throws. */
export async function withDeviceRisk<T extends { brand: string | null; model: string | null }>(client: Client, shopId: string | null, devices: T[]): Promise<(T & { risk: DeviceRisk })[]> {
  const keys = devices.map((d) => modelKey(d.brand, d.model));
  const map = await risksForModels(client, shopId, keys);
  return devices.map((d, i) => {
    const k = keys[i];
    const r = (k && map[k]) || computeRisk([]);
    return { ...d, risk: { level: r.level, label: r.label, hint: RISK_META[r.level].hint, reasons: r.reasons, minDepositPct: r.minDepositPct, maxMonths: r.maxMonths } };
  });
}
