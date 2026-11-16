import { redirect } from "next/navigation";
import { getSessionProfile, dashboardPath } from "@/lib/auth/auth";
import { LampLogin } from "./lamp-login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getSessionProfile();
  if (session) redirect(dashboardPath(session.profile.role));
  const error = searchParams?.error;

  // Sign-in with the 3D desk lamp: pull the cord to turn the light on and show the form.
  // The form still posts to the same `login` action (./actions.ts) as before.
  return <LampLogin error={error ?? null} />;
}
