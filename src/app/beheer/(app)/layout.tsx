import { SiteHeader } from "@/components/SiteHeader";
import { BeheerNav } from "@/components/BeheerNav";
import { SignOutButton } from "@/components/SignOutButton";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { pendingRequestCount } from "@/server/requests";

/** Alle Beheer-pagina's: staf met minimaal ledenbeheer-recht en MFA. Elke pagina/actie controleert zelf nogmaals. */
export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff("beheer", "members.read");
  const role = (s.user as { role?: string }).role;
  const pending = can(role, "members.write") ? await pendingRequestCount() : 0;
  const links = [
    { href: "/beheer", label: "Overzicht" },
    { href: "/beheer/leden", label: "Leden" },
    ...(can(role, "members.write") ? [{ href: "/beheer/verzoeken", label: pending ? `Verzoeken (${pending})` : "Verzoeken" }] : []),
    ...(can(role, "access.manage") ? [{ href: "/beheer/ledenaccounts", label: "Koppelingen" }] : []),
    ...(can(role, "import") ? [{ href: "/beheer/import", label: "Import" }] : []),
    ...(can(role, "newsletter.manage") ? [{ href: "/beheer/nieuwsbrieven", label: "Nieuwsbrieven" }] : []),
    ...(can(role, "scanlog.read") ? [{ href: "/beheer/controlelogboek", label: "Controles" }] : []),
    ...(can(role, "staff.manage") ? [{ href: "/beheer/accounts", label: "Accounts" }] : []),
    ...(can(role, "security.read") ? [{ href: "/beheer/meldingen", label: "Meldingen" }] : []),
    { href: "/beheer/beveiliging", label: "Beveiliging" },
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
