import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { FlashToaster } from "@/components/flash-toaster";
import { readFlash } from "@/lib/flash";
import type { Role } from "@/lib/nav";
import { roleMeta } from "@/lib/nav";

export function DashboardShell({
  role, userName, children,
}: {
  role: Role;
  userName: string;
  title?: string;
  children: React.ReactNode;
}) {
  const flash = readFlash();
  return (
    <div className="flex min-h-screen">
      <FlashToaster flash={flash} />
      <Sidebar role={role} userName={userName} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav role={role} userName={userName} />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">{roleMeta[role].title}</h1>
              <p className="text-xs text-muted-foreground">MoneyMobile workspace</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{userName}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              {userName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 space-y-6 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
