import { redirect } from "next/navigation";
import { Smartphone, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";
import { getSessionProfile, dashboardPath } from "@/lib/auth/auth";
import Image from "next/image";
import landImage from "./land.webp";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getSessionProfile();
  if (session) redirect(dashboardPath(session.profile.role));
  const error = searchParams?.error;

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,3fr)_minmax(380px,1fr)]">
      {/* Image panel - 75% on desktop, full-width banner on mobile */}
      <div className="relative overflow-hidden bg-[#e9f3fd] lg:h-screen lg:sticky lg:top-0">
        {/* Fill the space above/below the image with colours sampled from its top and bottom edges */}
        <div
          aria-hidden
          className="hidden lg:block absolute inset-x-0 top-0 h-1/2"
          style={{
            background:
              "linear-gradient(to right, #ecf6fd 0%, #ebf5fd 8%, #e5f2fd 17%, #dff0fc 25%, #dff0fd 33%, #d4eafd 42%, #c3e2fd 50%, #b9dcfc 58%, #8fc5fc 67%, #a9d4fc 75%, #b8dcfd 83%, #badefd 92%, #d4eafd 100%)",
          }}
        />
        <div
          aria-hidden
          className="hidden lg:block absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background:
              "linear-gradient(to right, #e1edfc 0%, #e5f1fd 8%, #5586cd 17%, #346fc2 25%, #2c69be 33%, #2162ba 42%, #185bb3 50%, #1957af 58%, #306ec6 67%, #4981d4 75%, #3572c8 83%, #3e82dc 92%, #4188e4 100%)",
          }}
        />
        {/* Full image, never cropped */}
        <Image
          src={landImage}
          alt="MoneyMobile — phone installments, smarter control"
          sizes="(min-width: 1024px) 75vw, 100vw"
          quality={90}
          placeholder="blur"
          priority
          className="relative w-full h-auto lg:h-full lg:object-contain"
        />
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
            <h2 className="text-3xl font-semibold tracking-tight">Sign in</h2>
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
            <Button className="w-full" size="lg" type="submit">Sign in</Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Accounts are created by your administrator. Contact them if you can&apos;t sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
