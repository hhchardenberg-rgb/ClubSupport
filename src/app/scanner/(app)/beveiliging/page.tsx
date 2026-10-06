import Link from "next/link";
import { SecurityPanel } from "@/components/SecurityPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Beveiliging" };

export default async function Page() {
  const s = await requireStaff("scanner", "scan");
  return (
    <>
      <SiteHeader area="scanner"><SignOutButton to="/scanner/inloggen" /></SiteHeader>
      <main id="main">
        <h1>Beveiliging</h1>
        <p><Link href="/scanner">← Terug naar de scanner</Link></p>
        <SecurityPanel twoFactorEnabled={!!s.user.twoFactorEnabled} mfaRequired={env.requireMfaForScanner} />
      </main>
    </>
  );
}
