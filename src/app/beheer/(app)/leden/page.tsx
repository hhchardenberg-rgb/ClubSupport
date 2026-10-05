import Link from "next/link";
import { EmptyState, PageTitle, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { listMembers, MEMBER_STATUS_FILTERS } from "@/server/admin";

export const metadata = { title: "Leden" };
const LABEL: Record<string, string> = { actief: "Actief", gedeactiveerd: "Gedeactiveerd", "zonder-pas": "Zonder actieve pas", verwijderd: "Verwijderd" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  await requireStaff("beheer", "members.read");
  const sp = await searchParams;
  const status = (MEMBER_STATUS_FILTERS as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const { rows, total, page, pages } = await listMembers({ q: sp.q, status, page: Number(sp.page) || 1 });
  const href = (p: number) => `/beheer/leden?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), page: String(p) })}`;
  return (
    <>
      <PageTitle title="Leden" sub={`${total} resultaten`} actions={<Link className="btn" href="/beheer/leden/nieuw">Nieuw lid</Link>} />
      <form method="get" className="card" role="search" aria-label="Leden zoeken">
        <div className="toolbar">
          <div className="grow">
            <label htmlFor="q">Naam of lidnummer</label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} maxLength={100} />
          </div>
          <div className="mid">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">Alle</option>
              {MEMBER_STATUS_FILTERS.map((f) => <option key={f} value={f}>{LABEL[f]}</option>)}
            </select>
          </div>
          <button>Zoeken</button>
        </div>
      </form>
            {rows.length === 0 ? (
        <EmptyState title="Geen leden gevonden">Pas de zoekopdracht of het filter aan.</EmptyState>
      ) : (
        <div className="table-wrap">
        <table>
          <caption className="sr-only">Ledenlijst</caption>
          <thead><tr><th scope="col">Lidnummer</th><th scope="col">Naam</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.memberNumber}</td>
                <td><Link href={`/beheer/leden/${r.id}`}>{r.fullName}</Link></td>
                <td>
                  <StatusBadge status={r.deletedAt ? "deleted" : r.passStatus === "active" ? "active" : r.passStatus === "deactivated" ? "deactivated" : "none"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <nav className="pager" aria-label="Paginering">
        {page > 1 && <Link className="btn secondary" href={href(page - 1)}>Vorige</Link>}
        <span>Pagina {page} van {pages}</span>
        {page < pages && <Link className="btn secondary" href={href(page + 1)}>Volgende</Link>}
      </nav>
    </>
  );
}
