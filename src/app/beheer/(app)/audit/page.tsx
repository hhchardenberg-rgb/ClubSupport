import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { listAudit, listAuditActors } from "@/server/admin";

export const metadata = { title: "Audit" };
const fmt = (d: Date) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Amsterdam" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; page?: string }> }) {
  await requireStaff("beheer", "audit.read");
  const sp = await searchParams;
  const [{ rows, page, pages, total }, actors] = await Promise.all([listAudit({ action: sp.action, actor: sp.actor, page: Number(sp.page) || 1 }), listAuditActors()]);
  const href = (p: number) => `/beheer/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(sp.actor ? { actor: sp.actor } : {}), page: String(p) })}`;
  const chipHref = (id?: string) => `/beheer/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(id ? { actor: id } : {}) })}`;
  return (
    <>
      <PageTitle title="Audit" sub="Wie deed wat en wanneer. Bevat nooit wachtwoorden, tokens of onnodige persoonsgegevens. Bewaartermijn: configureerbaar (standaard 730 dagen)." />
      <nav className="chips" aria-label="Kies een account">
        <Link className="chip" href={chipHref(undefined)} aria-current={!sp.actor ? "true" : undefined}>Iedereen</Link>
        {actors.map((a) => <Link key={a.id} className="chip" href={chipHref(a.id)} aria-current={sp.actor === a.id ? "true" : undefined}>{a.name} <span className="chip-n">{a.n}</span></Link>)}
      </nav>
      <form method="get" className="card" role="search">
        <input type="hidden" name="actor" value={sp.actor ?? ""} />
        <div className="toolbar"><div className="grow"><label htmlFor="a">Filter op actie (bijv. pass, member, staff)</label><input id="a" name="action" defaultValue={sp.action ?? ""} maxLength={40} /></div><button>Filteren</button></div>
      </form>
      <p className="muted">{total} gebeurtenissen</p>
      <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">Tijd</th><th scope="col">Actie</th><th scope="col">Door</th><th scope="col">Doel</th><th scope="col">Details</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}><td>{fmt(e.at)}</td><td>{e.action}</td><td>{e.actorName ?? (e.actorUserId ? "(verwijderd account)" : "systeem")}</td><td>{e.targetType} {e.targetId?.slice(0, 8)}</td><td className="wrap"><code>{JSON.stringify(e.metadata)}</code></td></tr>
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
