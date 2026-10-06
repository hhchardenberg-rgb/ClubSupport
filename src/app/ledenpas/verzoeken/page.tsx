import { inArray } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { Badge, Flash } from "@/components/ui";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { formatDateNl } from "@/lib/membership";
import { requireMember } from "@/lib/session";
import { listMembersForAccount } from "@/server/accounts";
import { listRequestsForAccount, REQUEST_LABEL, REQUEST_STATUS_LABEL, type RequestType } from "@/server/requests";
import { requestCancellationAction, requestDetailsAction, withdrawRequestAction } from "./actions";

export const metadata = { title: "Verzoeken" };
export const dynamic = "force-dynamic";
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(d) : "–");
const TONE = { pending: "warn", approved: "ok", rejected: "bad", withdrawn: "plain" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const s = await requireMember();
  const sp = await searchParams;
  const [members, requests] = await Promise.all([listMembersForAccount(s.user.id), listRequestsForAccount(s.user.id)]);
  const memberEmail = new Map<string, string>();
  if (members.length) for (const r of await db.select({ id: schema.member.id, email: schema.member.email }).from(schema.member).where(inArray(schema.member.id, members.map((m) => m.memberId)))) memberEmail.set(r.id, r.email ?? "");
  return (
    <>
      <SiteHeader><SignOutButton to="/ledenpas/inloggen" /></SiteHeader>
      <main id="main">
        <h1>Verzoeken</h1>
        <p><Link href="/ledenpas">← Terug naar je ledenpas</Link></p>
        <p className="muted">Wil je een gegeven wijzigen of je lidmaatschap opzeggen? Doe hier een verzoek. De ledenadministratie beoordeelt het; er verandert niets voordat het is goedgekeurd. Dit wijzigt nooit het e-mailadres waarmee je inlogt.</p>
        <Flash msg={sp.msg} err={sp.err} />

        {members.length === 0 ? <p className="notice">Aan dit account is nog geen lid gekoppeld.</p> : members.map((m) => (
          <section key={m.memberId} className="card" aria-label={m.fullName}>
            <h2>{m.fullName} <span className="muted">· lidnummer {m.memberNumber}</span></h2>
            <form action={requestDetailsAction} aria-label={`Gegevens wijzigen voor ${m.fullName}`}>
              <h3>Gegevens wijzigen</h3>
              <input type="hidden" name="memberId" value={m.memberId} />
              <label htmlFor={`n-${m.memberId}`}>Naam</label><input id={`n-${m.memberId}`} name="fullName" defaultValue={m.fullName} maxLength={120} required />
              <label htmlFor={`e-${m.memberId}`}>Contact-e-mailadres (optioneel)</label><input id={`e-${m.memberId}`} name="email" type="email" defaultValue={memberEmail.get(m.memberId) ?? ""} maxLength={254} />
              <label htmlFor={`t-${m.memberId}`}>Toelichting (optioneel)</label><input id={`t-${m.memberId}`} name="note" maxLength={300} />
              <p><button>Wijziging aanvragen</button></p>
            </form>
            <form action={requestCancellationAction} aria-label={`Lidmaatschap opzeggen voor ${m.fullName}`}>
              <h3>Lidmaatschap opzeggen</h3>
              <p className="muted">Je lidmaatschap eindigt op de gekozen datum, mits goedgekeurd. Je pas werkt daarna niet meer.</p>
              <input type="hidden" name="memberId" value={m.memberId} />
              <label htmlFor={`d-${m.memberId}`}>Gewenste einddatum</label><input id={`d-${m.memberId}`} name="endDate" type="date" required />
              <label htmlFor={`o-${m.memberId}`}>Toelichting (optioneel)</label><input id={`o-${m.memberId}`} name="note" maxLength={300} />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Ik wil mijn lidmaatschap opzeggen</label>
              <p><button className="danger">Opzegging aanvragen</button></p>
            </form>
          </section>
        ))}

        <section className="card" aria-labelledby="mv">
          <h2 id="mv">Mijn verzoeken</h2>
          {requests.length === 0 ? <p className="muted">Je hebt nog geen verzoeken gedaan.</p> : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
              {requests.map((r) => {
                const p = r.payload as { fullName?: string; email?: string; endDate?: string };
                return (
                  <li key={r.id} className="notice">
                    <p><strong>{REQUEST_LABEL[r.type as RequestType] ?? r.type}</strong> voor {r.memberName} · <Badge tone={TONE[r.status as keyof typeof TONE] ?? "plain"}>{REQUEST_STATUS_LABEL[r.status] ?? r.status}</Badge> <span className="muted">aangevraagd {fmt(r.createdAt)}</span></p>
                    {r.type === "details" ? <p className="muted">{[p.fullName && `Naam: ${p.fullName}`, p.email && `E-mailadres: ${p.email}`].filter(Boolean).join(" · ")}</p> : p.endDate ? <p className="muted">Gewenste einddatum: {formatDateNl(p.endDate)}</p> : null}
                    {r.decisionNote && <p>Toelichting ledenadministratie: {r.decisionNote}</p>}
                    {r.status === "pending" && <form action={withdrawRequestAction}><input type="hidden" name="id" value={r.id} /><button className="secondary small">Verzoek intrekken</button></form>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
