import Link from "next/link";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { dashboardCounts } from "@/server/admin";

export const metadata = { title: "Overzicht" };

export default async function Page() {
  const s = await requireStaff("beheer", "members.read");
  const c = await dashboardCounts();
  const role = (s.user as { role?: string }).role;
  return (
    <>
      <h1>Beheer</h1>
      <div className="row" style={{ alignItems: "stretch" }}>
        {[
          ["Leden", c.members],
          ["Actieve passen", c.active],
          ["Gedeactiveerd", c.deactivated],
          ["Scans (24 uur)", c.scans_24h],
          ["Mailproblemen", c.mail_problems],
        ].map(([l, n]) => (
          <div key={String(l)} className="card" style={{ flex: "1 1 150px", margin: 0 }}>
            <div className="muted">{l}</div>
            <div style={{ fontSize: "2rem", fontWeight: 700 }}>{n}</div>
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
