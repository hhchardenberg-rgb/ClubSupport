import Link from "next/link";
import { PageTitle } from "@/components/ui";
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
      <PageTitle title="Audit" sub="Wie deed wat en wanneer. Bevat nooit wachtwoorden, tokens of onnodige persoonsgegevens. Bewaartermijn: configureerbaar (standaard 730 dagen)." />
      <form method="get" className="card" role="search"><label htmlFor="a">Filter op actie (bijv. pass, member, staff)</label><input id="a" name="action" defaultValue={sp.action ?? ""} maxLength={40} /><p><button>Filteren</button></p></form>
      <p className="muted">{total} gebeurtenissen</p>
      <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">Tijd</th><th scope="col">Actie</th><th scope="col">Door</th><th scope="col">Doel</th><th scope="col">Details</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}><td>{fmt(e.at)}</td><td>{e.action}</td><td>{e.actorUserId?.slice(0, 8) ?? "systeem"}</td><td>{e.targetType} {e.targetId?.slice(0, 8)}</td><td className="wrap"><code>{JSON.stringify(e.metadata)}</code></td></tr>
          ))}
        </tbody>
      </table>
      </div>
      <nav className="pager" aria-label="Paginering">
        {page > 1 && <Link className="btn secondary" href={href(page - 1)}>Vorige</Link>}
        <span>Pagina {page} van {pages}</span>
        {page < pages && <Link className="btn secondary" href={href(page + 1)}>Volgende</Link>}
      </nav>
    </>
  );
}
