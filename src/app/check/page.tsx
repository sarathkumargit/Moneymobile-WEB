import type { Metadata } from "next";
import { ImeiCheckForm } from "@/components/devices/imei-check-form";

export const metadata: Metadata = { title: "Financed phone check — MoneyMobile", description: "Check whether a phone is under an installment agreement before unlocking or flashing it." };

// Public page (no login) for phone repair technicians.
export default function CheckPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Is this phone financed?</h1>
        <p className="text-sm text-muted-foreground">Before you unlock, reset or flash a phone, check its IMEI. If it is still under an installment agreement, please contact the shop first.</p>
      </div>
      <ImeiCheckForm />
      <p className="text-center text-xs text-muted-foreground">Dial <span className="font-mono">*#06#</span> on the phone to see its IMEI. This check shows only the shop to contact — never the owner&apos;s details. Answers are signed by MoneyMobile.</p>
    </main>
  );
}
