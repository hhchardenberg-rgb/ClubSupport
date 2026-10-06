import Link from "next/link";
import { Badge, EmptyState, Flash, PageTitle } from "@/components/ui";
import { formatDateNl } from "@/lib/membership";
import { requireStaff } from "@/lib/session";
import { listChangeRequests, REQUEST_LABEL, REQUEST_STATUS_LABEL, type RequestType } from "@/server/requests";
import { decideRequestAction } from "../actions";

export const metadata = { title: "Verzoeken" };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d) : "–");

export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireStaff("beheer", "members.write");
  const sp = await searchParams;
  const [pending, done] = await Promise.all([listChangeRequests({ pending: true }), listChangeRequests({ pending: false })]);
  return (
    <>
      <PageTitle title="Verzoeken" sub="Wijzigingsverzoeken van leden. Er wordt pas iets doorgevoerd na uw goedkeuring." />
      <Flash msg={sp.msg} err={sp.err} />
      {pending.length === 0 ? <EmptyState title="Geen openstaande verzoeken">Nieuwe verzoeken van leden verschijnen hier.</EmptyState> : pending.map((r) => {
        const p = r.payload as { fullName?: string; email?: string; endDate?: string; note?: string };
        return (
          <section key={r.id} className="card" aria-label={`${REQUEST_LABEL[r.type as RequestType]} ${r.memberName}`}>
            <h2>{REQUEST_LABEL[r.type as RequestType] ?? r.type}</h2>
            <p><Link href={`/beheer/leden/${r.memberId}`}>{r.memberName}</Link> ({r.memberNumber}) · aangevraagd {fmt(r.createdAt)} door {r.requesterEmail ?? "onbekend account"}</p>
            {r.type === "details" ? (
              <table>
                <thead><tr><th scope="col">Veld</th><th scope="col">Nu</th><th scope="col">Gevraagd</th></tr></thead>
                <tbody>
                  {p.fullName && <tr><td>Naam</td><td>{r.memberName}</td><td><strong>{p.fullName}</strong></td></tr>}
                  {p.email && <tr><td>Contact-e-mail</td><td>{r.memberEmail ?? "–"}</td><td><strong>{p.email}</strong></td></tr>}
                </tbody>
              </table>
            ) : <p>Gewenste einddatum van het lidmaatschap: <strong>{formatDateNl(p.endDate ?? null)}</strong></p>}
            {p.note && <p className="muted">Toelichting lid: {p.note}</p>}
            <form action={decideRequestAction}>
              <input type="hidden" name="id" value={r.id} />
              <label htmlFor={`n-${r.id}`}>Toelichting (verplicht bij afwijzen; het lid ziet deze)</label>
              <input id={`n-${r.id}`} name="note" maxLength={300} />
              <p className="row"><button name="decision" value="approve">Goedkeuren en doorvoeren</button><button name="decision" value="reject" className="secondary">Afwijzen</button></p>
            </form>
          </section>
        );
      })}
      <section className="card" aria-labelledby="af">
        <h2 id="af">Recent afgehandeld</h2>
        {done.length === 0 ? <p className="muted">Nog niets afgehandeld.</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Afgehandelde verzoeken">
            <table>
              <thead><tr><th scope="col">Lid</th><th scope="col">Verzoek</th><th scope="col">Uitkomst</th><th scope="col">Op</th></tr></thead>
              <tbody>{done.map((r) => <tr key={r.id}><td><Link href={`/beheer/leden/${r.memberId}`}>{r.memberName}</Link></td><td>{REQUEST_LABEL[r.type as RequestType] ?? r.type}</td><td><Badge tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "bad" : "plain"}>{REQUEST_STATUS_LABEL[r.status] ?? r.status}</Badge></td><td>{fmt(r.decidedAt)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
