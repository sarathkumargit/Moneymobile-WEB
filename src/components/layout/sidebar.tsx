"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Smartphone } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { navByRole, roleMeta, type Role } from "@/lib/shared/nav";
import { signOut } from "@/lib/auth/auth-actions";

export function Sidebar({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const items = navByRole[role];
  const meta = roleMeta[role];

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="font-semibold">MoneyMobile</p>
          <p className="text-xs text-muted-foreground">{meta.title}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const content = (
            <span
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                item.soon && "cursor-default opacity-60 hover:bg-transparent hover:text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.soon && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  Soon
                </span>
              )}
            </span>
          );
          return item.soon ? (
            <div key={item.href} title="Module coming soon">{content}</div>
          ) : (
            <Link key={item.href} href={item.href}>{content}</Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 leading-tight overflow-hidden">
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
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
