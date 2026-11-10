import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";

// Hardware key + tamper score badges for Device Mgmt / customer pages (migrations 0026 + 0027).
// Loads quietly: before those migrations run, nothing is shown.

export type SecurityBadge = { key_state: string | null; tamper_score: number; verified_boot_state: string | null };

export async function loadSecurityBadges(enrollmentIds: string[]): Promise<Record<string, SecurityBadge>> {
  const out: Record<string, SecurityBadge> = {};
  if (!enrollmentIds.length) return out;
  const supabase = createClient();
  const { data, error } = await supabase.from("device_enrollments").select("id,key_state,tamper_score,verified_boot_state").in("id", enrollmentIds);
  if (error) return out;
  for (const r of (data ?? []) as Array<{ id: string; key_state: string | null; tamper_score: number | null; verified_boot_state: string | null }>) {
    out[r.id] = { key_state: r.key_state, tamper_score: Number(r.tamper_score || 0), verified_boot_state: r.verified_boot_state };
  }
  return out;
}

const KEY: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral"; title: string }> = {
  active:        { label: "Hardware key ✓", variant: "success", title: "Check-ins are signed by the key in this phone's secure chip" },
  pending:       { label: "Hardware key: waiting", variant: "neutral", title: "The phone will create its key on the next check-in" },
  legacy:        { label: "No hardware key (app 1.10)", variant: "neutral", title: "Update this phone to app 1.11.0 to sign its check-ins" },
  lost:          { label: "Hardware key lost", variant: "danger", title: "The phone's secure storage lost the key — usually a reset or flash" },
  unsigned:      { label: "Unsigned check-ins", variant: "danger", title: "The phone stopped signing its check-ins" },
  bad_signature: { label: "Wrong signature", variant: "danger", title: "A check-in arrived with a wrong hardware signature" },
};

export function SecurityBadgeView({ b, href = "/shop/tamper-alerts" }: { b?: SecurityBadge; href?: string }) {
  if (!b) return null;
  const k = b.key_state ? KEY[b.key_state] : undefined;
  const score = b.tamper_score;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {k && <Badge variant={k.variant} title={k.title}>{k.label}</Badge>}
      {b.verified_boot_state && b.verified_boot_state !== "verified" && b.verified_boot_state !== "unknown" && <Badge variant="danger" title="The secure chip reports firmware that is not the maker's original">Firmware not verified</Badge>}
      {score > 0 && (
        <Link href={href}><Badge variant={score >= 60 ? "danger" : score >= 30 ? "warning" : "neutral"} title="Points of open tamper alerts (last 30 days)">Tamper score {score}</Badge></Link>
      )}
    </div>
  );
}
