import { SiteHeader } from "@/components/SiteHeader";
import { BeheerNav } from "@/components/BeheerNav";
import { SignOutButton } from "@/components/SignOutButton";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";

/** Alle Beheer-pagina's: staf met minimaal ledenbeheer-recht en MFA. Elke pagina/actie controleert zelf nogmaals. */
export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff("beheer", "members.read");
  const role = (s.user as { role?: string }).role;
  const links = [
    { href: "/beheer", label: "Overzicht" },
    { href: "/beheer/leden", label: "Leden" },
    ...(can(role, "access.manage") ? [{ href: "/beheer/ledenaccounts", label: "Koppelingen" }] : []),
    ...(can(role, "import") ? [{ href: "/beheer/import", label: "Import" }] : []),
    ...(can(role, "scanlog.read") ? [{ href: "/beheer/controlelogboek", label: "Controles" }] : []),
    ...(can(role, "staff.manage") ? [{ href: "/beheer/accounts", label: "Accounts" }] : []),
    ...(can(role, "audit.read") ? [{ href: "/beheer/audit", label: "Audit" }] : []),
  ];
  return (
    <>
      <SiteHeader area="beheer" nav={<BeheerNav links={links} />}>
        <SignOutButton to="/beheer/inloggen" />
      </SiteHeader>
      <main id="main" style={{ maxWidth: 980 }}>{children}</main>
    </>
  );
}
