import { createClient } from "@/lib/supabase/server";

// Shared helpers for the Super Admin "all shops" pages. These pages use the signed-in user's
// client, so Row-Level Security applies: a super admin sees every shop, anyone else sees nothing
// more than they could already see.

/** Newest-first pages stop here, to stay fast as data grows. */
export const LIMIT = 200;

export type ShopRef = { id: string; name: string };

/** Reads the optional ?shop=<id> filter, ignoring anything that doesn't look like an id. */
export function shopParam(v?: string): string | null {
  return v && /^[0-9a-fA-F-]{8,64}$/.test(v) ? v : null;
}

/** All shops (for the filter dropdown) plus an id → name lookup for table cells. */
export async function loadShops() {
  const supabase = createClient();
  const { data } = await supabase.from("shops").select("id,name").order("name");
  const list = (data ?? []) as ShopRef[];
  const names: Record<string, string> = {};
  list.forEach((s) => { names[s.id] = s.name; });
  return { list, names };
}

/** "in_stock" → "in stock". */
export const words = (s: string | null | undefined) => (s ?? "—").replace(/_/g, " ");
