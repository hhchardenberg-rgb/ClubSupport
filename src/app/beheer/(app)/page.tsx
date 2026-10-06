import Link from "next/link";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { dashboardCounts } from "@/server/admin";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "Overzicht" };

export default async function Page() {
  const s = await requireStaff("beheer", "members.read");
  const c = await dashboardCounts();
  const role = (s.user as { role?: string }).role;
  return (
    <>
      <PageTitle title="Overzicht" sub="Leden, passen en scans in één oogopslag." />
      <div className="row" style={{ alignItems: "stretch", gap: 14 }}>
        {[
          ["Leden", c.members],
          ["Actieve passen", c.active],
          ["Gedeactiveerd", c.deactivated],
          ["Oud-leden", Number(c.former_ended) + Number(c.former_expired)],
          ["Scans (24 uur)", c.scans_24h],
          ["Mailproblemen", c.mail_problems],
        ].map(([l, n]) => (
          <div key={String(l)} className="card stat">
            <div className="muted">{l}</div>
            <div className="n">{n}</div>
          </div>
        ))}
      </div>
      <p className="row" style={{ marginTop: 16 }}>
        <Link className="btn" href="/beheer/leden/nieuw">Nieuw lid</Link>
        <Link className="btn secondary" href="/beheer/leden">Leden zoeken</Link>
        {can(role, "import") && <Link className="btn secondary" href="/beheer/import">CSV importeren</Link>}
      </p>
    </>
  );
}
