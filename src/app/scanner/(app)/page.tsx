import Link from "next/link";
import { ScannerApp } from "@/components/ScannerApp";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Scannen" };

export default async function Page() {
  const s = await requireStaff("scanner", "scan");
  return (
    <>
      <SiteHeader area="scanner"><SignOutButton to="/scanner/inloggen" /></SiteHeader>
      <main id="main">
        <p className="muted">Ingelogd als {s.user.name}. Elke scan wordt live bij de server gecontroleerd.</p>
        <ScannerApp />
        <p className="muted"><Link href="/scanner/beveiliging">Beveiliging: passkey en herstelcodes</Link></p>
      </main>
    </>
  );
}
