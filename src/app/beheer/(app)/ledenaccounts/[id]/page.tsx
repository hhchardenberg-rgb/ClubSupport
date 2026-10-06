import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Flash, MembershipBadge, PageTitle, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { getMemberAccountDetail } from "@/server/admin";
import { unlinkAccountAction } from "../../actions";

export const metadata = { title: "Account" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireStaff("beheer", "access.manage");
  const { id } = await params;
  const sp = await searchParams;
  const d = await getMemberAccountDetail(id);
  if (!d) notFound();
  const { account, links } = d;
  const active = links.filter((l) => !l.deletedAt);
  return (
    <>
      <PageTitle title={account.email} sub={<>{account.disabledAt ? <Badge tone="bad">Geblokkeerd</Badge> : account.activated ? <Badge tone="ok">Geactiveerd</Badge> : <Badge tone="warn">Nog niet geactiveerd</Badge>} · {active.length} gekoppeld(e) lid/leden</>} actions={<Link className="btn secondary" href="/beheer/ledenaccounts">Alle accounts</Link>} />
      <Flash msg={sp.msg} err={sp.err} />
      <section className="card" aria-labelledby="gl">
        <h2 id="gl">Gekoppelde leden</h2>
        <p className="muted">Iedereen met toegang tot dit account ziet de passen van alle onderstaande leden. Ontkoppelen verwijdert alleen de koppeling; lid, lidmaatschap en pas blijven bestaan. Nieuwe koppelingen maakt u op de pagina van het lid.</p>
        {active.length === 0 ? <p>Aan dit account zijn geen leden gekoppeld.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Lid</th><th scope="col">Lidmaatschap</th><th scope="col">Pas</th><th scope="col"><span className="sr-only">Actie</span></th></tr></thead>
              <tbody>
                {active.map((l) => (
                  <tr key={l.memberId}>
                    <td><Link href={`/beheer/leden/${l.memberId}`}>{l.fullName}</Link> <span className="muted">({l.memberNumber})</span>{l.archivedAt ? <span className="muted"> · gearchiveerd</span> : null}</td>
                    <td><MembershipBadge status={l.membership} /></td>
                    <td><StatusBadge status={l.passStatus === "active" ? "active" : l.passStatus === "deactivated" ? "deactivated" : "none"} /></td>
                    <td>
                      <form action={unlinkAccountAction} className="row">
                        <input type="hidden" name="memberId" value={l.memberId} /><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="from" value="account" />
                        <label style={{ display: "flex", gap: 6, alignItems: "center", margin: 0 }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Bevestig</label>
                        <button className="secondary">Ontkoppelen</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
