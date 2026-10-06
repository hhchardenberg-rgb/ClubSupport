import Link from "next/link";
import { Badge, EmptyState, PageTitle } from "@/components/ui";
import { env } from "@/lib/env";
import { requireStaff } from "@/lib/session";
import { listScanLog, listScanLogControllers, SCAN_OUTCOMES } from "@/server/admin";

export const metadata = { title: "Controlelogboek" };
const OUTCOME: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "plain" }> = {
  valid: { label: "Geldig", tone: "ok" },
  inactive: { label: "Pas gedeactiveerd", tone: "warn" },
  membership_invalid: { label: "Lidmaatschap niet geldig", tone: "warn" },
  revoked: { label: "Ingetrokken of verwijderd", tone: "bad" },
  unknown: { label: "Onbekende code", tone: "bad" },
  rate_limited: { label: "Geblokkeerd (te veel)", tone: "warn" },
  lookup: { label: "Zoekopdracht", tone: "plain" },
};
const fmt = (d: Date) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Amsterdam" }).format(d);

type SP = { q?: string; scanner?: string; outcome?: string; from?: string; to?: string; page?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff("beheer", "scanlog.read");
  const sp = await searchParams;
  const [{ rows, total, page, pages }, controllers] = await Promise.all([listScanLog({ ...sp, page: Number(sp.page) || 1 }), listScanLogControllers()]);
  const href = (p: number) => `/beheer/controlelogboek?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "page")), page: String(p) } as Record<string, string>)}`;
  const chipHref = (id?: string) => `/beheer/controlelogboek?${new URLSearchParams({ ...Object.fromEntries(Object.entries({ ...sp, scanner: id ?? "" }).filter(([k, v]) => v && k !== "page")) } as Record<string, string>)}`;
  return (
    <>
      <PageTitle title="Controlelogboek" sub={`Alle scans en zoekopdrachten van controleurs. Bevat nooit de QR-code of de zoekterm. Bewaartermijn: ${env.scanRetentionDays} dagen.`} />
      <form method="get" className="card" role="search" aria-label="Controlelogboek doorzoeken">
        <div className="toolbar">
          <div className="grow"><label htmlFor="q">Lid (naam of lidnummer)</label><input id="q" name="q" defaultValue={sp.q ?? ""} maxLength={60} /></div>
          <input type="hidden" name="scanner" value={sp.scanner ?? ""} />
          <div className="mid">
            <label htmlFor="outcome">Uitkomst</label>
            <select id="outcome" name="outcome" defaultValue={sp.outcome ?? ""}>
              <option value="">Alle</option>
              {SCAN_OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME[o].label}</option>)}
            </select>
          </div>
          <div className="mid"><label htmlFor="from">Vanaf</label><input id="from" name="from" type="date" defaultValue={sp.from ?? ""} /></div>
          <div className="mid"><label htmlFor="to">Tot en met</label><input id="to" name="to" type="date" defaultValue={sp.to ?? ""} /></div>
          <button>Zoeken</button>
          <Link className="btn secondary" href="/beheer/controlelogboek">Wissen</Link>
        </div>
      </form>
      <nav className="chips" aria-label="Kies een controleur">
        <Link className="chip" href={chipHref(undefined)} aria-current={!sp.scanner ? "true" : undefined}>Alle controleurs</Link>
        {controllers.map((c) => (
          <Link key={c.id} className="chip" href={chipHref(c.id)} aria-current={sp.scanner === c.id ? "true" : undefined}>
            {c.name} <span className="chip-n">{c.n}</span>
          </Link>
        ))}
      </nav>
      <p className="muted" aria-live="polite">{total} registraties{sp.scanner ? ` van ${controllers.find((c) => c.id === sp.scanner)?.name ?? "deze controleur"}` : ""}</p>
      {rows.length === 0 ? (
        <EmptyState title="Geen registraties gevonden">Pas de filters aan.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Controlelogboek</caption>
            <thead><tr><th scope="col">Tijd</th><th scope="col">Controleur</th><th scope="col">Handeling</th><th scope="col">Lid</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const o = OUTCOME[r.outcome] ?? { label: r.outcome, tone: "plain" as const };
                return (
                  <tr key={r.id}>
                    <td>{fmt(r.at)}</td>
                    <td>{r.scannerName ?? "(verwijderd account)"}</td>
                    <td><Badge tone={o.tone}>{o.label}</Badge>{r.outcome === "lookup" && r.resultCount !== null ? ` ${r.resultCount} gevonden` : ""}</td>
                    <td>{r.memberName ? <>{r.memberName} <span className="muted">({r.memberNumber})</span></> : r.hasPass ? <span className="muted">(lid verwijderd)</span> : "–"}</td>
                  </tr>
                );
              })}
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
