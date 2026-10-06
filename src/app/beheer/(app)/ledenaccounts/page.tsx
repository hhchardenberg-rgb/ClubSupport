import Link from "next/link";
import { Badge, EmptyState, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { listMemberAccounts } from "@/server/admin";

export const metadata = { title: "Koppelingen" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireStaff("beheer", "access.manage");
  const sp = await searchParams;
  const { rows, total, page, pages } = await listMemberAccounts({ q: sp.q, page: Number(sp.page) || 1 });
  const qs = (p: number) => new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(p) });
  return (
    <>
      <PageTitle title="Koppelingen" sub={`${total} ledenaccounts. Een account kan aan meerdere leden gekoppeld zijn; koppelen gebeurt altijd expliciet door een beheerder.`} />
      <form method="get" className="card" role="search" aria-label="Accounts zoeken">
        <div className="toolbar"><div className="grow"><label htmlFor="q">E-mailadres</label><input id="q" name="q" defaultValue={sp.q ?? ""} maxLength={100} /></div><button>Zoeken</button></div>
      </form>
      {rows.length === 0 ? <EmptyState title="Geen accounts gevonden">Pas de zoekopdracht aan.</EmptyState> : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Ledenaccounts</caption>
            <thead><tr><th scope="col">E-mailadres</th><th scope="col">Account</th><th scope="col">Gekoppelde leden</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/beheer/ledenaccounts/${r.id}`}>{r.email}</Link></td>
                  <td>{r.disabledAt ? <Badge tone="bad">Geblokkeerd</Badge> : r.activated ? <Badge tone="ok">Geactiveerd</Badge> : <Badge tone="warn">Nog niet geactiveerd</Badge>}</td>
                  <td>{r.members}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="pager" aria-label="Paginering">
        {page > 1 && <Link className="btn secondary" href={`/beheer/ledenaccounts?${qs(page - 1)}`}>Vorige</Link>}
        <span>Pagina {page} van {pages}</span>
        {page < pages && <Link className="btn secondary" href={`/beheer/ledenaccounts?${qs(page + 1)}`}>Volgende</Link>}
      </nav>
    </>
  );
}
