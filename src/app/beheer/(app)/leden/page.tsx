import Link from "next/link";
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
      <h1>Leden</h1>
      <form method="get" className="card" role="search" aria-label="Leden zoeken">
        <div className="row" style={{ alignItems: "end" }}>
          <div style={{ flex: "2 1 220px" }}>
            <label htmlFor="q">Naam of lidnummer</label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} maxLength={100} />
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">Alle</option>
              {MEMBER_STATUS_FILTERS.map((f) => <option key={f} value={f}>{LABEL[f]}</option>)}
            </select>
          </div>
          <button>Zoeken</button>
          <Link className="btn secondary" href="/beheer/leden/nieuw">Nieuw lid</Link>
        </div>
      </form>
      <p className="muted" aria-live="polite">{total} resultaten</p>
      {rows.length === 0 ? (
        <div className="card" role="status"><p>Geen leden gevonden.</p></div>
      ) : (
        <table>
          <caption className="sr-only">Ledenlijst</caption>
          <thead><tr><th scope="col">Lidnummer</th><th scope="col">Naam</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.memberNumber}</td>
                <td><Link href={`/beheer/leden/${r.id}`}>{r.fullName}</Link></td>
                <td>
                  {r.deletedAt ? <span className="badge bad">Verwijderd</span> : r.passStatus === "active" ? <span className="badge ok">Actief</span> : r.passStatus === "deactivated" ? <span className="badge warn">Gedeactiveerd</span> : <span className="badge bad">Geen actieve pas</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <nav className="row" aria-label="Paginering" style={{ marginTop: 12 }}>
        {page > 1 && <Link className="btn secondary" href={href(page - 1)}>Vorige</Link>}
        <span>Pagina {page} van {pages}</span>
        {page < pages && <Link className="btn secondary" href={href(page + 1)}>Volgende</Link>}
      </nav>
    </>
  );
}
