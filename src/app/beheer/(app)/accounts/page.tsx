import Link from "next/link";
import { Flash, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { listStaff } from "@/server/admin";
import { changeRoleAction, changeStaffEmailAction, createStaffAction, resendStaffInviteAction, toggleStaffAction } from "../actions";

export const metadata = { title: "Accounts" };
const ROLE: Record<string, string> = { scanner: "Scanner (alleen scannen)", manager: "Ledenbeheer (leden en passen)", sysadmin: "Systeembeheer" };

export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const s = await requireStaff("beheer", "staff.manage");
  const sp = await searchParams;
  const staff = await listStaff();
  return (
    <>
      <PageTitle title="Accounts"  sub="Accounts van beheerders en controleurs. Elke medewerker meldt zich persoonlijk aan. Beheer- en controleursrollen horen nooit bij een gedeeld account. MFA is verplicht voor Ledenbeheer en Systeembeheer." />
      <Flash msg={sp.msg} err={sp.err} />
      <form action={createStaffAction} className="card" aria-labelledby="n">
        <h2 id="n">Staf-account aanmaken</h2>
        <label htmlFor="name">Naam</label><input id="name" name="name" required maxLength={120} />
        <label htmlFor="email">E-mailadres (persoonlijk)</label><input id="email" name="email" type="email" required />
        <label htmlFor="role">Rol</label>
        <select id="role" name="role" defaultValue="scanner">{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <p><button>Account aanmaken en uitnodigen</button></p>
      </form>
      {staff.map((u) => (
        <section key={u.id} className="card" aria-label={u.name}>
          <h3>{u.name} {u.id === s.user.id && <span className="muted">(jij)</span>}</h3>
          <p>{u.email} · {ROLE[u.role]} · {u.activated ? <span className="badge ok">Geactiveerd</span> : <span className="badge warn">Niet geactiveerd</span>} · {u.mfa ? <span className="badge ok">MFA aan</span> : <span className="badge warn">MFA ontbreekt</span>} {u.disabledAt && <span className="badge bad">Geblokkeerd</span>}</p>
          <div className="row" style={{ alignItems: "end" }}>
            <form action={changeRoleAction} className="row" style={{ alignItems: "end" }}>
              <input type="hidden" name="userId" value={u.id} />
              <div><label htmlFor={`r-${u.id}`}>Rol</label><select id={`r-${u.id}`} name="role" defaultValue={u.role}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <button className="secondary" disabled={u.id === s.user.id}>Rol wijzigen</button>
            </form>
            <form action={changeStaffEmailAction} className="row" style={{ alignItems: "end" }}>
              <input type="hidden" name="userId" value={u.id} />
              <div><label htmlFor={`e-${u.id}`}>Nieuw e-mailadres</label><input id={`e-${u.id}`} name="email" type="email" required /></div>
              <button className="secondary">Adres wijzigen</button>
            </form>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn secondary small" href={`/beheer/controlelogboek?scanner=${u.id}`}>Controles</Link>
            <Link className="btn secondary small" href={`/beheer/audit?actor=${u.id}`}>Auditlog</Link>
            {!u.activated && <form action={resendStaffInviteAction}><input type="hidden" name="userId" value={u.id} /><button className="secondary">Uitnodiging opnieuw versturen</button></form>}
            {u.id !== s.user.id && <form action={toggleStaffAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="disable" value={u.disabledAt ? "0" : "1"} /><button className={u.disabledAt ? "secondary" : "danger"}>{u.disabledAt ? "Weer activeren" : "Blokkeren"}</button></form>}
          </div>
        </section>
      ))}
    </>
  );
}
