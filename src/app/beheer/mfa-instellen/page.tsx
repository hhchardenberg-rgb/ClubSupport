import { redirect } from "next/navigation";
import { MfaSetup } from "@/components/MfaSetup";
import { SiteHeader } from "@/components/SiteHeader";
import { isStaff } from "@/lib/permissions";
import { getSession, hasPasskey } from "@/lib/session";

export const metadata = { title: "MFA instellen" };

export default async function Page() {
  const s = await getSession();
  if (!s) redirect("/beheer/inloggen");
  if (!isStaff((s.user as { role?: string }).role ?? "member")) redirect("/beheer/geen-toegang");
   if (s.user.twoFactorEnabled || (await hasPasskey(s.user.id))) redirect("/beheer");
  return (
    <>
      <SiteHeader area="beheer" />
      <main id="main">
        <h1>MFA instellen</h1>
        <MfaSetup area="beheer" />
      </main>
    </>
  );
}
