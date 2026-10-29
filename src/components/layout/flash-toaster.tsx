"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import type { Flash } from "@/lib/shared/flash";

// Shows a toast whenever a server action set a flash cookie, then clears it.
export function FlashToaster({ flash }: { flash: Flash | null }) {
  const [toast, setToast] = useState<Flash | null>(null);

  useEffect(() => {
    if (!flash) return;
    setToast(flash);
    try { document.cookie = "flash=; Max-Age=0; path=/"; } catch {}
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
    // re-run whenever a new flash arrives (distinct timestamp)
  }, [flash?.t]);

  if (!toast) return null;
  const ok = toast.type !== "error";
  return (
    <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-2">
      <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"}`}>
        {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
        <span className="max-w-xs">{toast.message}</span>
        <button onClick={() => setToast(null)} className="ml-1 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
