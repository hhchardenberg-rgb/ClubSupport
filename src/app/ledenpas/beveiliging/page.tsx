import Link from "next/link";
import { SecurityPanel } from "@/components/SecurityPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { requireMember } from "@/lib/session";

export const metadata = { title: "Beveiliging" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await requireMember();
  return (
    <>
      <SiteHeader><SignOutButton to="/ledenpas/inloggen" /></SiteHeader>
      <main id="main">
        <h1>Beveiliging</h1>
        <p><Link href="/ledenpas">← Terug naar je ledenpas</Link></p>
        <SecurityPanel twoFactorEnabled={!!s.user.twoFactorEnabled} mfaRequired={false} />
      </main>
    </>
  );
}
