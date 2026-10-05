import { redirect } from "next/navigation";
import { MfaSetup } from "@/components/MfaSetup";
import { SiteHeader } from "@/components/SiteHeader";
import { isStaff } from "@/lib/permissions";
import { getSession } from "@/lib/session";

export const metadata = { title: "MFA instellen" };

export default async function Page() {
  const s = await getSession();
  if (!s) redirect("/scanner/inloggen");
  if (!isStaff((s.user as { role?: string }).role ?? "member")) redirect("/scanner/geen-toegang");
  if (s.user.twoFactorEnabled) redirect("/scanner");
  return (
    <>
      <SiteHeader area="scanner" />
      <main id="main"><h1>MFA instellen</h1><MfaSetup area="scanner" /></main>
    </>
  );
}
