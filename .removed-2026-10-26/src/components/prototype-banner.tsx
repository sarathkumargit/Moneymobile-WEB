import { Info } from "lucide-react";

export function PrototypeBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <Info className="h-4 w-4 shrink-0" />
      <span>
        Prototype UI — figures below are <strong>sample data</strong>, not live records. Connect Supabase to show real data.
      </span>
    </div>
  );
}
