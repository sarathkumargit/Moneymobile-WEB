import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionProfile, dashboardPath } from "@/lib/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile.role !== "shop_admin") redirect(dashboardPath(session.profile.role));
  const name = session.profile.full_name || session.user.email || "Shop Admin";
  return <DashboardShell role="shop_admin" userName={name} title="Overview">{children}</DashboardShell>;
}
