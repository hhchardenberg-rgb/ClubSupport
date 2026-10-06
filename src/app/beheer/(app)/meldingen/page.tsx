import Link from "next/link";
import { Alert, Badge, EmptyState, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { listSecurityEvents, SECURITY_LABEL, type SecurityType } from "@/server/security";
import { acknowledgeSecurityAction } from "../actions";

export const metadata = { title: "Meldingen" };
const fmt = (d: Date) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d);
const TONE = { critical: "bad", warning: "warn", info: "plain" } as const;
const LABEL = { critical: "Kritiek", warning: "Waarschuwing", info: "Informatie" } as const;
const HELP: Partial<Record<SecurityType, string>> = {
  login_failures: "Controleer of het account misbruikt wordt. Het account is automatisch begrensd (5 pogingen per 5 minuten) en de eigenaar is gemaild.",
  mfa_failures: "Iemand probeert verificatiecodes te raden. De begrenzing blokkeert dit tijdelijk. Controleer of een medewerker dit zelf was.",
  scan_guessing: "Een controleur scant veel onbekende codes: mogelijk misbruik of een kapotte scanner. Bekijk het controlelogboek van deze controleur.",
  lookup_scraping: "Ongewoon veel zoekopdrachten: mogelijk wordt de ledenlijst afgetast. Bekijk het controlelogboek.",
  export_burst: "Meerdere exports kort na elkaar. Controleer in het auditlog wie en waarom.",
  export_off_hours: "Een export buiten kantooruren (23:00–06:00). Controleer of dit verwacht was.",
  mfa_reset: "Een systeembeheerder heeft MFA van een account gereset. Controleer de reden in het auditlog.",
  role_changed: "De rol van een account is gewijzigd. Controleer in het auditlog.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  await requireStaff("beheer", "security.read");
  const sp = await searchParams;
  const events = await listSecurityEvents({ open: !sp.alle });
  return (
    <>
      <PageTitle title="Meldingen" sub="Verdachte activiteit en kritieke beveiligingswijzigingen. U ontvangt hiervan ook een e-mail." actions={<Link className="btn secondary" href={sp.alle ? "/beheer/meldingen" : "/beheer/meldingen?alle=1"}>{sp.alle ? "Alleen openstaande" : "Alles tonen"}</Link>} />
      <Alert variant="info">Een melding bevat nooit wachtwoorden, codes of e-mailadressen. Markeer als afgehandeld nadat u het hebt beoordeeld; de handeling wordt vastgelegd.</Alert>
      {events.length === 0 ? (
        <EmptyState title="Geen meldingen">{sp.alle ? "Er zijn nog geen meldingen geweest." : "Er staan geen openstaande meldingen."}</EmptyState>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Beveiligingsmeldingen">
          <table>
            <caption className="sr-only">Beveiligingsmeldingen</caption>
            <thead><tr><th scope="col">Tijd</th><th scope="col">Ernst</th><th scope="col">Melding</th><th scope="col">Account</th><th scope="col"><span className="sr-only">Actie</span></th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{fmt(e.at)}</td>
                  <td><Badge tone={TONE[e.severity as keyof typeof TONE] ?? "plain"}>{LABEL[e.severity as keyof typeof LABEL] ?? e.severity}</Badge></td>
                  <td className="wrap"><strong>{SECURITY_LABEL[e.type as SecurityType] ?? e.type}</strong>{HELP[e.type as SecurityType] ? <><br /><span className="muted">{HELP[e.type as SecurityType]}</span></> : null}</td>
                  <td className="wrap">{e.userId ? (e.userName ?? "(verwijderd account)") : "–"}</td>
                  <td>{e.acknowledgedAt ? <span className="muted">Afgehandeld</span> : <form action={acknowledgeSecurityAction}><input type="hidden" name="id" value={e.id} /><button className="secondary small">Afgehandeld</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
