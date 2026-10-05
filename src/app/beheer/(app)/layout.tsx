import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";

/** Alle Beheer-pagina's: staf met minimaal ledenbeheer-recht en MFA. Elke pagina/actie controleert zelf nogmaals. */
export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff("beheer", "members.read");
  const role = (s.user as { role?: string }).role;
  return (
    <>
      <SiteHeader area="beheer">
        <nav aria-label="Beheer" style={{ display: "flex", gap: "4px 16px", flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
          <Link href="/beheer">Overzicht</Link>
          <Link href="/beheer/leden">Leden</Link>
          {can(role, "import") && <Link href="/beheer/import">Import</Link>}
          {can(role, "staff.manage") && <Link href="/beheer/personeel">Personeel</Link>}
          {can(role, "audit.read") && <Link href="/beheer/audit">Audit</Link>}
          <SignOutButton to="/beheer/inloggen" />
        </nav>
      </SiteHeader>
      <main id="main" style={{ maxWidth: 980 }}>{children}</main>
    </>
  );
}
