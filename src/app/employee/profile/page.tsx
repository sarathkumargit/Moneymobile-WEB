import { getSessionProfile } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const session = await getSessionProfile();
  const p = session?.profile;
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between border-b py-2.5 last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
  );
  return (<div className="grid gap-6 lg:grid-cols-2">
    <Card><CardHeader><CardTitle>My profile</CardTitle></CardHeader><CardContent>
      <Row k="Name" v={p?.full_name ?? "—"} />
      <Row k="Username" v={p?.username ? `@${p.username}` : "—"} />
      <Row k="Email" v={session?.user.email ?? "—"} />
      <Row k="Role" v="Employee" />
    </CardContent></Card>
    <ChangePasswordForm />
  </div>);
}
