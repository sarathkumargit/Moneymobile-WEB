"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, Smartphone } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { navByRole, roleMeta, type Role } from "@/lib/shared/nav";
import { signOut } from "@/lib/auth/auth-actions";

/**
 * Mobile navigation drawer. The desktop <Sidebar> is hidden below md, so on a phone this
 * hamburger (shown only below md) opens the same nav as a slide-in overlay. Without it there
 * was no way to move between pages on a phone.
 */
export function MobileNav({ role, userName }: { role: Role; userName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = navByRole[role];
  const meta = roleMeta[role];

  // Close when the route changes (a link was tapped).
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col border-r bg-card shadow-xl">
            <div className="flex h-16 items-center justify-between gap-2 border-b px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 leading-tight">
                  <p className="truncate font-semibold">MoneyMobile</p>
                  <p className="truncate text-xs text-muted-foreground">{meta.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                const content = (
                  <span
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      item.soon && "cursor-default opacity-60"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.soon && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Soon</span>
                    )}
                  </span>
                );
                return item.soon ? (
                  <div key={item.href}>{content}</div>
                ) : (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{content}</Link>
                );
              })}
            </nav>

            <div className="border-t p-3">
              <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden leading-tight">
                  <p className="truncate text-sm font-medium">{userName}</p>
                  <p className="truncate text-xs text-muted-foreground">{meta.title}</p>
                </div>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
