"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While an update is in progress, re-load the page data every few seconds so the status moves on its own.
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
