import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getSessionProfile, dashboardPath } from "@/lib/auth/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile.role !== "super_admin") redirect(dashboardPath(session.profile.role));
  const name = session.profile.full_name || session.user.email || "Super Admin";
  return <DashboardShell role="super_admin" userName={name} title="Overview">{children}</DashboardShell>;
}
