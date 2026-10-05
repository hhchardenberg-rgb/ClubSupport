import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { listAudit } from "@/server/admin";

export const metadata = { title: "Audit" };
const fmt = (d: Date) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Amsterdam" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requireStaff("beheer", "audit.read");
  const sp = await searchParams;
  const { rows, page, pages, total } = await listAudit({ action: sp.action, page: Number(sp.page) || 1 });
  const href = (p: number) => `/beheer/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), page: String(p) })}`;
  return (
    <>
      <h1>Audit</h1>
      <p className="muted">Wie deed wat en wanneer. Bevat nooit wachtwoorden, tokens of onnodige persoonsgegevens. Bewaartermijn: configureerbaar (standaard 730 dagen).</p>
      <form method="get" className="card" role="search"><label htmlFor="a">Filter op actie (bijv. pass, member, staff)</label><input id="a" name="action" defaultValue={sp.action ?? ""} maxLength={40} /><p><button>Filteren</button></p></form>
      <p className="muted">{total} gebeurtenissen</p>
      <table>
        <thead><tr><th scope="col">Tijd</th><th scope="col">Actie</th><th scope="col">Door</th><th scope="col">Doel</th><th scope="col">Details</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}><td>{fmt(e.at)}</td><td>{e.action}</td><td>{e.actorUserId?.slice(0, 8) ?? "systeem"}</td><td>{e.targetType} {e.targetId?.slice(0, 8)}</td><td><code>{JSON.stringify(e.metadata)}</code></td></tr>
          ))}
        </tbody>
      </table>
      <nav className="row" aria-label="Paginering" style={{ marginTop: 12 }}>
        {page > 1 && <Link className="btn secondary" href={href(page - 1)}>Vorige</Link>}
        <span>Pagina {page} van {pages}</span>
        {page < pages && <Link className="btn secondary" href={href(page + 1)}>Volgende</Link>}
      </nav>
    </>
  );
}
