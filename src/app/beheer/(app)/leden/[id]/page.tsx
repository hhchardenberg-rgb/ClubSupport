import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { getMemberDetail } from "@/server/admin";
import {
  deactivateAction, deleteMemberAction, linkAccountAction, reactivateAction, reissueAction, resendInviteAction, revokeAction, unlinkAccountAction, updateMemberAction,
} from "../../actions";

export const metadata = { title: "Lid" };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d) : "–");
const STATUS: Record<string, string> = { active: "Actief", deactivated: "Gedeactiveerd", revoked: "Definitief ingetrokken" };
const MAIL: Record<string, string> = { pending: "Klaargezet", sending: "Wordt verstuurd", sent: "Verzonden", failed: "Mislukt", not_sent_no_address: "Niet verzonden: geen e-mailadres", suppressed: "Uitgeschakeld" };
const KIND: Record<string, string> = { invitation: "Uitnodiging", pass_notice: "Pasmelding", password_reset: "Wachtwoordherstel" };

function Confirm({ label = "Ik bevestig deze actie" }: { label?: string }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> {label}
    </label>
  );
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const s = await requireStaff("beheer", "members.read");
  const role = (s.user as { role?: string }).role;
  const { id } = await params;
  const sp = await searchParams;
  const d = await getMemberDetail(id);
  if (!d) notFound();
  const { member: m, passes, accounts, emails } = d;
  const live = passes.find((p) => p.status === "active" || p.status === "deactivated");
  const canPass = can(role, "passes.manage");
  const deleted = !!m.deletedAt;

  return (
    <>
      <h1>{m.fullName}</h1>
      <p>Lidnummer <strong>{m.memberNumber}</strong> {deleted && <span className="badge bad">Verwijderd</span>}</p>
      <Flash msg={sp.msg} err={sp.err} />

      <section className="card" aria-labelledby="pas">
        <h2 id="pas">Pas</h2>
        {live ? (
          <p>Status: {live.status === "active" ? <span className="badge ok">Actief</span> : <span className="badge warn">Gedeactiveerd</span>} · uitgegeven {fmt(live.issuedAt)}</p>
        ) : (
          <p><span className="badge bad">Geen actieve pas</span></p>
        )}
        {canPass && !deleted && live?.status === "active" && (
          <form action={deactivateAction} className="card">
            <h3>Deactiveren</h3>
            <p className="muted">De QR-code is direct ongeldig. Heractiveren kan later door een bevoegd account.</p>
            <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="passId" value={live.id} />
            <label htmlFor="r1">Reden</label><input id="r1" name="reason" required minLength={3} maxLength={300} />
            <Confirm /><p><button className="secondary">Pas deactiveren</button></p>
          </form>
        )}
        {canPass && !deleted && live?.status === "deactivated" && (
          <form action={reactivateAction} className="card">
            <h3>Opnieuw activeren</h3>
            <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="passId" value={live.id} />
            <label htmlFor="r2">Reden</label><input id="r2" name="reason" required minLength={3} maxLength={300} />
            <Confirm /><p><button>Pas activeren</button></p>
          </form>
        )}
        {canPass && !deleted && (
          <>
            <form action={reissueAction} className="card">
              <h3>Opnieuw uitgeven</h3>
              <p className="muted">Maakt een nieuwe unieke QR-code en trekt de oude <strong>direct en onomkeerbaar</strong> in.</p>
              <input type="hidden" name="memberId" value={m.id} />
              <label htmlFor="k">Aanleiding</label>
              <select id="k" name="kind" required defaultValue="lost">
                <option value="lost">Verloren gemeld</option><option value="leaked">Gelekt / misbruik</option><option value="reissued">Nieuwe pas gewenst</option>
              </select>
              <label htmlFor="r3">Toelichting</label><input id="r3" name="reason" required minLength={3} maxLength={300} />
              <Confirm label="Ik begrijp dat de oude pas nooit meer geldig wordt" /><p><button className="danger">Nieuwe pas uitgeven</button></p>
            </form>
            {live && (
              <form action={revokeAction} className="card">
                <h3>Definitief intrekken</h3>
                <p className="muted">Zonder nieuwe pas. Een ingetrokken pas kan nooit meer worden geactiveerd.</p>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="passId" value={live.id} />
                <label htmlFor="r4">Reden</label><input id="r4" name="reason" required minLength={3} maxLength={300} />
                <Confirm /><p><button className="danger">Definitief intrekken</button></p>
              </form>
            )}
          </>
        )}
        <details>
          <summary>Geschiedenis van passen ({passes.length})</summary>
          <table>
            <thead><tr><th scope="col">Uitgegeven</th><th scope="col">Status</th><th scope="col">Ingetrokken</th><th scope="col">Reden</th></tr></thead>
            <tbody>{passes.map((p) => <tr key={p.id}><td>{fmt(p.issuedAt)}</td><td>{STATUS[p.status] ?? p.status}</td><td>{fmt(p.revokedAt)}</td><td>{p.revocationReason ?? p.statusNote ?? "–"}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      {!deleted && can(role, "members.write") && (
        <form action={updateMemberAction} className="card" aria-labelledby="gv">
          <h2 id="gv">Gegevens</h2>
          <input type="hidden" name="id" value={m.id} />
          <label htmlFor="fullName">Naam</label><input id="fullName" name="fullName" defaultValue={m.fullName} required maxLength={120} />
          <label htmlFor="email">E-mailadres (contact)</label><input id="email" name="email" type="email" defaultValue={m.email ?? ""} maxLength={254} />
          <label htmlFor="note">Notitie (geen invloed op geldigheid)</label><input id="note" name="membershipNote" defaultValue={m.membershipNote ?? ""} maxLength={300} />
          <p className="muted">Het lidnummer is vast en kan niet worden gewijzigd.</p>
          <p><button>Opslaan</button></p>
        </form>
      )}

      <section className="card" aria-labelledby="acc">
        <h2 id="acc">Account en e-mail</h2>
        {accounts.length === 0 && <p>Dit lid is aan geen enkel account gekoppeld.</p>}
        {accounts.map((a) => (
          <div key={a.userId} className="notice" style={{ marginBottom: 8 }}>
            <p>{a.email} · {a.activated ? <span className="badge ok">Geactiveerd</span> : <span className="badge warn">Nog niet geactiveerd</span>} · gekoppeld {fmt(a.grantedAt)}</p>
            <div className="row">
              {!a.activated && can(role, "email.view") && (
                <form action={resendInviteAction}><input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="userId" value={a.userId} /><button className="secondary">Uitnodiging opnieuw versturen</button></form>
              )}
              {can(role, "access.manage") && (
                <form action={unlinkAccountAction} className="row"><input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="userId" value={a.userId} />
                  <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Bevestig</label>
                  <button className="secondary">Ontkoppelen</button></form>
              )}
            </div>
          </div>
        ))}
        {!deleted && can(role, "access.manage") && (
          <form action={linkAccountAction} className="row" style={{ alignItems: "end" }}>
            <input type="hidden" name="memberId" value={m.id} />
            <div style={{ flex: "1 1 240px" }}><label htmlFor="le">Koppel aan bestaand ledenaccount (e-mailadres)</label><input id="le" name="email" type="email" required /></div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Bevestig koppeling</label>
            <button className="secondary">Koppelen</button>
          </form>
        )}
        {can(role, "email.view") && (
          <>
            <h3>Afleverstatus</h3>
            {emails.length === 0 ? <p className="muted">Geen berichten.</p> : (
              <table>
                <thead><tr><th scope="col">Bericht</th><th scope="col">Status</th><th scope="col">Pogingen</th><th scope="col">Tijd</th></tr></thead>
                <tbody>{emails.map((e) => <tr key={e.id}><td>{KIND[e.kind] ?? e.kind}</td><td>{MAIL[e.status] ?? e.status}{e.lastError ? ` (${e.lastError})` : ""}</td><td>{e.attempts}</td><td>{fmt(e.sentAt ?? e.createdAt)}</td></tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </section>

      {canPass && !deleted && (
        <form action={deleteMemberAction} className="card" aria-labelledby="del" style={{ borderLeftColor: "#b00020" }}>
          <h2 id="del">Lid verwijderen</h2>
          <p>De pas is direct ongeldig en het lid verdwijnt uit de lijsten. Persoonsgegevens worden na de bewaartermijn definitief gewist. Verwijderen kan alleen per lid, nooit in bulk.</p>
          <input type="hidden" name="memberId" value={m.id} />
          <label htmlFor="r5">Reden</label><input id="r5" name="reason" required minLength={3} maxLength={300} />
          <label htmlFor="typed">Typ VERWIJDER om te bevestigen</label><input id="typed" name="typed" required autoComplete="off" />
          <p><button className="danger">Lid verwijderen</button></p>
        </form>
      )}
    </>
  );
}
