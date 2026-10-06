import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Flash, MembershipBadge, PageTitle, StatusBadge } from "@/components/ui";
import { formatDateNl, isFormerMember, MEMBERSHIP_HELP, MEMBERSHIP_LABEL, STORED_LABEL, type MembershipStatus } from "@/lib/membership";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { isPassValid } from "@/lib/status";
import { getMemberDetail } from "@/server/admin";
import { deletionImpact } from "@/server/memberships";
import {
  archiveMemberAction, deactivateAction, deleteMemberAction, linkAccountAction, membershipAction, reactivateAction, reissueAction, resendInviteAction, revokeAction, unarchiveMemberAction, unlinkAccountAction, updateMemberAction,
} from "../../actions";

export const metadata = { title: "Lid" };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d) : "–");
const STATUS: Record<string, string> = { active: "Actief", deactivated: "Gedeactiveerd", revoked: "Definitief ingetrokken" };
const MAIL: Record<string, string> = { pending: "Klaargezet", sending: "Wordt verstuurd", sent: "Verzonden", failed: "Mislukt", not_sent_no_address: "Niet verzonden: geen e-mailadres", suppressed: "Uitgeschakeld" };
const KIND: Record<string, string> = { invitation: "Uitnodiging", pass_notice: "Pasmelding", password_reset: "Wachtwoordherstel" };
const EVENT: Record<string, string> = {
  "member.create": "Lid aangemaakt", "member.update": "Gegevens gewijzigd", "member.archive": "Gearchiveerd", "member.unarchive": "Hersteld uit archief", "member.delete": "Verwijderd",
  "membership.create": "Lidmaatschap aangemaakt", "membership.activate": "Lidmaatschap geactiveerd", "membership.suspend": "Lidmaatschap geschorst", "membership.end": "Lidmaatschap beëindigd", "membership.update": "Lidmaatschap gewijzigd",
  "pass.deactivate": "Pas gedeactiveerd", "pass.reactivate": "Pas geactiveerd", "pass.reissue": "Nieuwe pas uitgegeven", "pass.revoke": "Pas ingetrokken",
  "access.grant": "Account gekoppeld", "access.revoke": "Account ontkoppeld",
};

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
  const { member: m, passes, accounts, others, emails, memberships, effective, events } = d;
  const live = passes.find((p) => p.status === "active" || p.status === "deactivated");
  const canPass = can(role, "passes.manage");
  const canWrite = can(role, "members.write");
  const deleted = !!m.deletedAt;
  const archived = !!m.archivedAt;
  const open = memberships.find((x) => x.status !== "ended");
  const scanValid = isPassValid({ status: live?.status ?? "none", memberDeleted: deleted, memberArchived: archived, membershipValid: effective === "valid" });
  const impact = archived && !deleted && can(role, "members.delete") ? await deletionImpact(m.id) : null;

  return (
    <>
      <PageTitle
        title={m.fullName}
        sub={<>Lidnummer <strong>{m.memberNumber}</strong>{m.externalRef ? <> · extern <strong>{m.externalRef}</strong></> : null} {deleted ? <Badge tone="bad">Verwijderd</Badge> : archived ? <Badge tone="warn">Gearchiveerd</Badge> : null}{isFormerMember(effective) ? <> <Badge>Oud-lid</Badge></> : null}</>}
        actions={<Link className="btn secondary" href="/beheer/leden">Alle leden</Link>}
      />
      <Flash msg={sp.msg} err={sp.err} />

      <section className="card" aria-labelledby="ov">
        <h2 id="ov">Overzicht</h2>
        <div className="stats">
          <div className="stat"><span className="muted">Lidmaatschap</span><MembershipBadge status={effective} /><span className="muted">{open ? `${formatDateNl(open.startDate)} t/m ${formatDateNl(open.endDate)}` : "–"}</span></div>
          <div className="stat"><span className="muted">Pas</span>{deleted ? <StatusBadge status="deleted" /> : <StatusBadge status={live ? (live.status as "active" | "deactivated") : "none"} />}<span className="muted">{live ? `uitgegeven ${fmt(live.issuedAt)}` : "–"}</span></div>
          <div className="stat"><span className="muted">Account(s)</span><strong>{accounts.length}</strong><span className="muted">{accounts.length ? accounts.map((a) => a.email).join(", ") : "geen koppeling"}</span></div>
          <div className="stat"><span className="muted">Scan op dit moment</span>{scanValid ? <Badge tone="ok">Geldig</Badge> : <Badge tone="bad">Ongeldig</Badge>}<span className="muted">pas actief én lidmaatschap geldig</span></div>
        </div>
        <details>
          <summary>Wat betekenen de statussen?</summary>
          <p className="muted">Lid, lidmaatschap, account en pas hebben elk een eigen status. Een scan is alleen geldig als de pas actief is <strong>én</strong> het lidmaatschap nu geldig is.</p>
          <ul>
            {(Object.keys(MEMBERSHIP_LABEL) as (keyof typeof MEMBERSHIP_LABEL)[]).map((k) => <li key={k}><strong>{MEMBERSHIP_LABEL[k]}</strong>: {MEMBERSHIP_HELP[k]}</li>)}
            <li><strong>Pas actief / gedeactiveerd / ingetrokken</strong>: de pas zelf. Ingetrokken is definitief; gedeactiveerd kan worden teruggedraaid.</li>
            <li><strong>Gearchiveerd</strong>: het lid is uit de lijsten en scans zijn ongeldig; alles blijft bewaard en kan worden hersteld.</li>
          </ul>
        </details>
      </section>

      <div className="cols">
      <div>

      <section className="card" aria-labelledby="lm">
        <h2 id="lm">Lidmaatschap</h2>
        <p><MembershipBadge status={effective} /> {open ? <span className="muted">Opgeslagen status: {STORED_LABEL[open.status as MembershipStatus]} · {formatDateNl(open.startDate)} t/m {formatDateNl(open.endDate)}</span> : null}</p>
        <p className="muted">{isFormerMember(effective) ? "Dit is een oud-lid: het lidmaatschap is beëindigd of verlopen. Het lid blijft bewaard (pasgeschiedenis, koppelingen) en kan met een nieuw lidmaatschap weer lid worden. " : ""}{MEMBERSHIP_HELP[effective]} Datums gelden in de tijdzone Europe/Amsterdam; de einddatum is de laatste geldige dag. Contributiebetaling beïnvloedt de status niet.</p>
        {canWrite && !deleted && !archived && (
          <>
            {!open && (
              <form action={membershipAction} className="card">
                <h3>Lidmaatschap starten</h3>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="action" value="activate" />
                <label htmlFor="s1">Begindatum (optioneel)</label><input id="s1" name="startDate" type="date" />
                <label htmlFor="e1">Einddatum (optioneel)</label><input id="e1" name="endDate" type="date" />
                <Confirm /><p><button>Lidmaatschap starten</button></p>
              </form>
            )}
            {open && (
              <form action={membershipAction} className="card">
                <h3>Datums aanpassen</h3>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="action" value="update" />
                <label htmlFor="s2">Begindatum</label><input id="s2" name="startDate" type="date" defaultValue={open.startDate ?? ""} />
                <label htmlFor="e2">Einddatum</label><input id="e2" name="endDate" type="date" defaultValue={open.endDate ?? ""} />
                <p><button className="secondary">Datums opslaan</button></p>
              </form>
            )}
            {open?.status === "active" && (
              <form action={membershipAction} className="card">
                <h3>Schorsen</h3>
                <p className="muted">Scans zijn direct ongeldig tot het lidmaatschap weer wordt geactiveerd. De pas blijft ongewijzigd.</p>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="action" value="suspend" />
                <label htmlFor="r6">Reden</label><input id="r6" name="reason" required minLength={3} maxLength={300} />
                <Confirm /><p><button className="secondary">Lidmaatschap schorsen</button></p>
              </form>
            )}
            {open?.status === "suspended" && (
              <form action={membershipAction} className="card">
                <h3>Weer activeren</h3>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="action" value="activate" />
                <label htmlFor="r7">Reden (optioneel)</label><input id="r7" name="reason" maxLength={300} />
                <Confirm /><p><button>Lidmaatschap activeren</button></p>
              </form>
            )}
            {open && (
              <form action={membershipAction} className="card">
                <h3>Beëindigen</h3>
                <p className="muted">Scans zijn ongeldig. Lid, accounts en pasgeschiedenis blijven bewaard. Een nieuw lidmaatschap start daarna als nieuwe regel.</p>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="action" value="end" />
                <label htmlFor="e3">Einddatum (leeg = vandaag)</label><input id="e3" name="endDate" type="date" />
                <label htmlFor="r8">Reden</label><input id="r8" name="reason" required minLength={3} maxLength={300} />
                <Confirm /><p><button className="danger">Lidmaatschap beëindigen</button></p>
              </form>
            )}
          </>
        )}
        <details>
          <summary>Geschiedenis van lidmaatschappen ({memberships.length})</summary>
          <table>
            <thead><tr><th scope="col">Status</th><th scope="col">Begin</th><th scope="col">Einde</th><th scope="col">Toelichting</th></tr></thead>
            <tbody>{memberships.map((x) => <tr key={x.id}><td>{STORED_LABEL[x.status as MembershipStatus] ?? x.status}</td><td>{formatDateNl(x.startDate)}</td><td>{formatDateNl(x.endDate)}</td><td>{x.statusNote ?? "–"}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <section className="card" aria-labelledby="pas">
        <h2 id="pas">Pas</h2>
        {live ? (
          <p>Status: <StatusBadge status={live.status as "active" | "deactivated"} /> · uitgegeven {fmt(live.issuedAt)}</p>
        ) : (
          <p><StatusBadge status="none" /></p>
        )}
        <p className="muted">Een pas hoort bij precies één lid. Een actieve pas is alleen geldig zolang ook het lidmaatschap geldig is.</p>
        {canPass && !deleted && live?.status === "active" && (
          <form action={deactivateAction} className="card">
            <h3>Blokkeren (deactiveren)</h3>
            <p className="muted">De QR-code is direct ongeldig. Heractiveren kan later door een bevoegd account.</p>
            <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="passId" value={live.id} />
            <label htmlFor="r1">Reden</label><input id="r1" name="reason" required minLength={3} maxLength={300} />
            <Confirm /><p><button className="secondary">Pas blokkeren</button></p>
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
              <h3>Vervangen (nieuwe pas uitgeven)</h3>
              <p className="muted">Maakt een nieuwe unieke QR-code en trekt de oude <strong>direct en onomkeerbaar</strong> in. De oude pas blijft als historie bewaard.</p>
              <input type="hidden" name="memberId" value={m.id} />
              <label htmlFor="k">Aanleiding</label>
              <select id="k" name="kind" required defaultValue="lost">
                <option value="lost">Verloren of gestolen</option><option value="leaked">Gelekt / misbruik</option><option value="reissued">Nieuwe pas gewenst</option>
              </select>
              <label htmlFor="r3">Toelichting</label><input id="r3" name="reason" required minLength={3} maxLength={300} />
              <Confirm label="Ik begrijp dat de oude pas nooit meer geldig wordt" /><p><button className="danger">Nieuwe pas uitgeven</button></p>
            </form>
            {live && (
              <form action={revokeAction} className="card">
                <h3>Intrekken / als verloren markeren</h3>
                <p className="muted">Zonder nieuwe pas. Een ingetrokken pas kan nooit meer worden geactiveerd.</p>
                <input type="hidden" name="memberId" value={m.id} /><input type="hidden" name="passId" value={live.id} />
                <label htmlFor="k2">Aanleiding</label>
                <select id="k2" name="kind" defaultValue="lost"><option value="lost">Verloren of gestolen</option><option value="leaked">Gelekt / misbruik</option><option value="admin">Anders (beheeractie)</option></select>
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
      </div>
      <div>

      {!deleted && canWrite && (
        <form action={updateMemberAction} className="card" aria-labelledby="gv">
          <h2 id="gv">Gegevens</h2>
          <input type="hidden" name="id" value={m.id} />
          <label htmlFor="fullName">Naam</label><input id="fullName" name="fullName" defaultValue={m.fullName} required maxLength={120} />
          <label htmlFor="email">E-mailadres (contact, optioneel; mag bij meerdere leden voorkomen)</label><input id="email" name="email" type="email" defaultValue={m.email ?? ""} maxLength={254} />
          <label htmlFor="externalRef">Externe referentie (optioneel, uniek)</label><input id="externalRef" name="externalRef" defaultValue={m.externalRef ?? ""} maxLength={64} />
          <label htmlFor="note">Notitie (geen invloed op geldigheid; alleen zichtbaar voor beheer)</label><input id="note" name="membershipNote" defaultValue={m.membershipNote ?? ""} maxLength={300} />
          <p className="muted">Het lidnummer is vast en kan niet worden gewijzigd.</p>
          <p><button>Opslaan</button></p>
        </form>
      )}

      <section className="card" aria-labelledby="acc">
        <h2 id="acc">Accounts en e-mail</h2>
        <p className="muted">Een account kan aan meerdere leden zijn gekoppeld (bijv. een gezin). Een koppeling is altijd expliciet en nooit afgeleid uit een gelijk e-mailadres.</p>
        {accounts.length === 0 && <p>Dit lid is aan geen enkel account gekoppeld.</p>}
        {accounts.map((a) => {
          const co = others.filter((o) => o.userId === a.userId);
          return (
            <div key={a.userId} className="notice" style={{ marginBottom: 8 }}>
              <p>{can(role, "access.manage") ? <Link href={`/beheer/ledenaccounts/${a.userId}`}>{a.email}</Link> : a.email} · {a.activated ? <Badge tone="ok">Geactiveerd</Badge> : <Badge tone="warn">Nog niet geactiveerd</Badge>} · gekoppeld {fmt(a.grantedAt)}</p>
              <p className="muted">{co.length ? <>Dit account is ook gekoppeld aan: {co.map((o, i) => <span key={o.memberId}>{i ? ", " : ""}<Link href={`/beheer/leden/${o.memberId}`}>{o.fullName}</Link> ({o.memberNumber})</span>)}.</> : "Alleen dit lid is aan dit account gekoppeld."}</p>
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
          );
        })}
        {!deleted && !archived && can(role, "access.manage") && (
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

      </div>
      <div className="span-2">
      <section className="card" aria-labelledby="hist">
        <h2 id="hist">Historie</h2>
        {events.length === 0 ? <p className="muted">Nog geen vastgelegde handelingen.</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Historie van dit lid">
            <table>
              <thead><tr><th scope="col">Tijd</th><th scope="col">Handeling</th><th scope="col">Door</th><th scope="col">Reden</th></tr></thead>
              <tbody>{events.map((e) => <tr key={e.id}><td>{fmt(e.at)}</td><td>{EVENT[e.action] ?? e.action}</td><td>{e.actorName ?? "systeem"}</td><td className="wrap">{typeof e.metadata?.reason === "string" ? e.metadata.reason : typeof e.metadata?.note === "string" ? e.metadata.note : "–"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {canWrite && !deleted && !archived && (
        <form action={archiveMemberAction} className="card" aria-labelledby="arch">
          <h2 id="arch">Archiveren</h2>
          <p>Het lid verdwijnt uit de standaardlijsten en scans zijn ongeldig. Lidmaatschap, pas, accounts en historie blijven bewaard; dit is omkeerbaar. Verwijderen is een aparte, latere stap.</p>
          <input type="hidden" name="memberId" value={m.id} />
          <label htmlFor="ra">Reden</label><input id="ra" name="reason" required minLength={3} maxLength={300} />
          <Confirm /><p><button className="secondary">Lid archiveren</button></p>
        </form>
      )}
      {canWrite && !deleted && archived && (
        <form action={unarchiveMemberAction} className="card" aria-labelledby="unarch">
          <h2 id="unarch">Archief</h2>
          <p>Dit lid is gearchiveerd{m.archivedAt ? ` sinds ${fmt(m.archivedAt)}` : ""}. Scans zijn ongeldig.</p>
          <input type="hidden" name="memberId" value={m.id} />
          <label htmlFor="ru">Reden</label><input id="ru" name="reason" required minLength={3} maxLength={300} />
          <p><button>Lid herstellen</button></p>
        </form>
      )}
      {impact && (
        <form action={deleteMemberAction} className="card danger-zone" aria-labelledby="del">
          <h2 id="del">Lid verwijderen</h2>
          <p>De pas wordt definitief ingetrokken en het lid verdwijnt uit alle lijsten. Persoonsgegevens worden na de bewaartermijn definitief gewist. Verwijderen kan alleen per lid, nooit in bulk, en alleen na archivering.</p>
          <p><strong>Dit raakt:</strong> {impact.passes} pas(sen), {impact.memberships} lidmaatschapsregel(s) en {impact.accounts.length} accountkoppeling(en).</p>
          {impact.accounts.length > 0 && (
            <ul>{impact.accounts.map((a) => <li key={a.userId}>{a.email}: de koppeling met dit lid vervalt; <strong>het account en {a.otherMembers} ander(e) gekoppelde lid/leden blijven bestaan</strong>.</li>)}</ul>
          )}
          <input type="hidden" name="memberId" value={m.id} />
          <label htmlFor="r5">Reden</label><input id="r5" name="reason" required minLength={3} maxLength={300} />
          <label htmlFor="typed">Typ het lidnummer <strong>{m.memberNumber}</strong> om te bevestigen</label><input id="typed" name="typed" required autoComplete="off" />
          <p><button className="danger">Lid verwijderen</button></p>
        </form>
      )}
      </div>
      </div>
    </>
  );
}
