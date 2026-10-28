import { redirect } from "next/navigation";
import { Smartphone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";
import { getSessionProfile, dashboardPath } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getSessionProfile();
  if (session) redirect(dashboardPath(session.profile.role));
  const error = searchParams?.error;

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Smartphone className="h-6 w-6" />
          </div>
          <span className="text-xl font-semibold">MoneyMobile</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            Installment management for mobile phone retailers
          </h1>
          <p className="text-primary-foreground/80">
            Manage inventory, customers, guarantors, installment agreements, payments
            and supported device controls — across multiple shops, with strict role-based access.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">
          © {new Date().getFullYear()} MoneyMobile. Multi-tenant platform.
        </p>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Smartphone className="h-6 w-6" />
            </div>
            <span className="text-xl font-semibold">MoneyMobile</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your credentials to access your workspace.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form action={login} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@shop.com" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
            </div>
            <Button className="w-full" type="submit">Sign in</Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Accounts are created by your administrator. Contact them if you can&apos;t sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
