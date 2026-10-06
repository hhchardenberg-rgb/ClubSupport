import Link from "next/link";
import { EmptyState, MembershipBadge, PageTitle, StatusBadge } from "@/components/ui";
import { MEMBERSHIP_LABEL } from "@/lib/membership";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { listMembers, MEMBER_STATUS_FILTERS, MEMBERSHIP_FILTERS } from "@/server/admin";

export const metadata = { title: "Leden" };
const LABEL: Record<string, string> = { actief: "Pas actief", gedeactiveerd: "Pas gedeactiveerd", "zonder-pas": "Zonder actieve pas", gearchiveerd: "Gearchiveerd", verwijderd: "Verwijderd" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; lidmaatschap?: string; page?: string }> }) {
  const s = await requireStaff("beheer", "members.read");
  const role = (s.user as { role?: string }).role;
  const sp = await searchParams;
  const status = (MEMBER_STATUS_FILTERS as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const membership = (MEMBERSHIP_FILTERS as readonly string[]).includes(sp.lidmaatschap ?? "") ? sp.lidmaatschap : undefined;
  const { rows, total, page, pages } = await listMembers({ q: sp.q, status, membership, page: Number(sp.page) || 1 });
  const qs = (p: number) => new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { status } : {}), ...(membership ? { lidmaatschap: membership } : {}), page: String(p) });
  return (
    <>
      <PageTitle title="Leden" sub={`${total} resultaten`} actions={can(role, "members.write") ? <Link className="btn" href="/beheer/leden/nieuw">Nieuw lid</Link> : undefined} />
      <form method="get" className="card" role="search" aria-label="Leden zoeken">
        <div className="toolbar">
          <div className="grow">
            <label htmlFor="q">Naam, lidnummer of externe referentie</label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} maxLength={100} />
          </div>
          <div className="mid">
            <label htmlFor="lidmaatschap">Lidmaatschap</label>
            <select id="lidmaatschap" name="lidmaatschap" defaultValue={membership ?? ""}>
              <option value="">Alle</option>
              {MEMBERSHIP_FILTERS.map((f) => <option key={f} value={f}>{MEMBERSHIP_LABEL[f]}</option>)}
            </select>
          </div>
          <div className="mid">
            <label htmlFor="status">Pas / archief</label>
            <select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">Alle (niet gearchiveerd)</option>
              {MEMBER_STATUS_FILTERS.map((f) => <option key={f} value={f}>{LABEL[f]}</option>)}
            </select>
          </div>
          <button>Zoeken</button>
        </div>
      </form>
      {can(role, "members.export") && (
        <form method="post" action="/api/beheer/export" className="row" style={{ margin: "8px 0" }}>
          <input type="hidden" name="q" value={sp.q ?? ""} /><input type="hidden" name="status" value={status ?? ""} /><input type="hidden" name="membership" value={membership ?? ""} />
          <button className="secondary" title="Download alle leden uit deze selectie als CSV">Selectie exporteren (CSV)</button>
          <span className="muted">Bevat persoonsgegevens; ga er zorgvuldig mee om. Elke export wordt vastgelegd.</span>
        </form>
      )}
      {rows.length === 0 ? (
        <EmptyState title="Geen leden gevonden">Pas de zoekopdracht of het filter aan.</EmptyState>
      ) : (
        <div className="table-wrap">
        <table>
          <caption className="sr-only">Ledenlijst</caption>
          <thead><tr><th scope="col">Lidnummer</th><th scope="col">Naam</th><th scope="col">Lidmaatschap</th><th scope="col">Pas</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.memberNumber}</td>
                <td><Link href={`/beheer/leden/${r.id}`}>{r.fullName}</Link>{r.archivedAt ? <span className="muted"> · gearchiveerd</span> : null}</td>
                <td><MembershipBadge status={r.membership} /></td>
                <td><StatusBadge status={r.deletedAt ? "deleted" : r.passStatus === "active" ? "active" : r.passStatus === "deactivated" ? "deactivated" : "none"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <nav className="pager" aria-label="Paginering">
        {page > 1 && <Link className="btn secondary" href={`/beheer/leden?${qs(page - 1)}`}>Vorige</Link>}
        <span>Pagina {page} van {pages}</span>
        {page < pages && <Link className="btn secondary" href={`/beheer/leden?${qs(page + 1)}`}>Volgende</Link>}
      </nav>
    </>
  );
}
