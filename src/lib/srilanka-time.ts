// Sri Lanka time helpers. The shop operates in Sri Lanka, so every installment due time means
// Sri Lanka wall-clock time regardless of where the staff member's browser is. Sri Lanka is a
// fixed UTC+05:30 with no daylight saving, so a constant offset is correct and needs no library.
export const SL_OFFSET_MIN = 330; // +05:30
const pad = (n: number) => String(n).padStart(2, "0");

// A UTC instant (stored due_at) → Sri Lanka wall-clock value for a <input type="datetime-local">.
export function toSLInput(iso: string): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  const sl = new Date(t.getTime() + SL_OFFSET_MIN * 60000);
  return `${sl.getUTCFullYear()}-${pad(sl.getUTCMonth() + 1)}-${pad(sl.getUTCDate())}T${pad(sl.getUTCHours())}:${pad(sl.getUTCMinutes())}`;
}

// A Sri Lanka wall-clock string ("yyyy-MM-dd" or "yyyy-MM-ddThh:mm") → the matching UTC instant.
export function slToUtcIso(wall: string): string | null {
  const m = (wall || "").trim();
  const full = m.length <= 10 ? `${m}T00:00` : m;
  const p = full.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!p) return null;
  const utcMs = Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5]) - SL_OFFSET_MIN * 60000;
  const d = new Date(utcMs);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// The Sri Lanka calendar day ("yyyy-MM-dd") of a UTC instant.
export function slDate(iso: string): string {
  return toSLInput(iso).slice(0, 10);
}

// A UTC instant → friendly Sri Lanka time for display, e.g. "11/26/2026, 5:00 PM (SL)".
export function formatSL(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  const sl = new Date(t.getTime() + SL_OFFSET_MIN * 60000);
  const h = sl.getUTCHours();
  const ap = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${pad(sl.getUTCMonth() + 1)}/${pad(sl.getUTCDate())}/${sl.getUTCFullYear()}, ${h12}:${pad(sl.getUTCMinutes())} ${ap} (SL)`;
}

// A UTC instant → Sri Lanka date only, e.g. "11/26/2026".
export function formatSLDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  const sl = new Date(t.getTime() + SL_OFFSET_MIN * 60000);
  return `${pad(sl.getUTCMonth() + 1)}/${pad(sl.getUTCDate())}/${sl.getUTCFullYear()}`;
}

// A UTC instant → Sri Lanka time only, e.g. "5:00:21 PM".
export function formatSLTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "";
  const sl = new Date(t.getTime() + SL_OFFSET_MIN * 60000);
  const h = sl.getUTCHours();
  const ap = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad(sl.getUTCMinutes())}:${pad(sl.getUTCSeconds())} ${ap}`;
}
