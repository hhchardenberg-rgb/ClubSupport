import { SiteHeader } from "@/components/SiteHeader";
import { BeheerNav } from "@/components/BeheerNav";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";

/** Alle Beheer-pagina's: staf met minimaal ledenbeheer-recht en MFA. Elke pagina/actie controleert zelf nogmaals. */
export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff("beheer", "members.read");
  const role = (s.user as { role?: string }).role;
  const links = [
    { href: "/beheer", label: "Overzicht" },
    { href: "/beheer/leden", label: "Leden" },
    ...(can(role, "import") ? [{ href: "/beheer/import", label: "Import" }] : []),
    ...(can(role, "staff.manage") ? [{ href: "/beheer/personeel", label: "Personeel" }] : []),
    ...(can(role, "audit.read") ? [{ href: "/beheer/audit", label: "Audit" }] : []),
  ];
  return (
    <>
      <SiteHeader area="beheer">
        <BeheerNav links={links} />
      </SiteHeader>
      <main id="main" style={{ maxWidth: 980 }}>{children}</main>
    </>
  );
}
