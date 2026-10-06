import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsletterForm } from "@/components/NewsletterForm";
import { NewsletterProgress } from "@/components/NewsletterProgress";
import { Alert, Badge, Flash, PageTitle } from "@/components/ui";
import { env } from "@/lib/env";
import { NEWSLETTER_STATUS } from "@/lib/newsletter-status";
import { requireStaff } from "@/lib/session";
import { newsletterMail } from "@/server/email/newsletter-render";
import { formatAmsterdamLocal } from "@/lib/time";
import { AUDIENCE_LABEL, audienceRecipients, dispatchDueNewsletters, getNewsletter, newsletterStats, SCHEDULE_MIN_MINUTES, TEST_MODE_CAP, type Audience } from "@/server/newsletter";
import { cancelNewsletterAction, deleteNewsletterAction, retryNewsletterAction, scheduleNewsletterAction, sendNewsletterAction, testNewsletterAction, unscheduleNewsletterAction } from "../actions";

export const metadata = { title: "Nieuwsbrief" };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d) : "–");
const AUD_NOTE = "Je ontvangt deze nieuwsbrief omdat je lid of oud-lid bent van HHC ClubSupport.";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const s = await requireStaff("beheer", "newsletter.manage");
  const { id } = await params;
  const sp = await searchParams;
  await dispatchDueNewsletters().catch(() => undefined); // een aangebroken planning direct oppakken
  const n = await getNewsletter(id);
  if (!n) notFound();
  const draft = n.status === "draft";
  const [stats, rec] = await Promise.all([newsletterStats(id), draft ? audienceRecipients(n.audience as Audience) : Promise.resolve(null)]);
  const preview = newsletterMail({ subject: n.subject, body: n.body, token: "voorbeeld", audienceNote: AUD_NOTE, preview: true });
  const st = NEWSLETTER_STATUS[n.status] ?? { label: n.status, tone: "plain" as const };
  const live = env.emailMode === "live";

  return (
    <>
      <PageTitle title={n.subject} sub={<><Badge tone={st.tone}>{st.label}</Badge> · doelgroep {AUDIENCE_LABEL[n.audience as Audience] ?? n.audience}{n.sentAt ? ` · verstuurd ${fmt(n.sentAt)}` : ""}{n.status === "scheduled" ? ` · gepland ${fmt(n.scheduledAt)}` : ""}</>} actions={<Link className="btn secondary" href="/beheer/nieuwsbrieven">Alle nieuwsbrieven</Link>} />
      <Flash msg={sp.msg} err={sp.err} />

      {n.scheduleError && draft && <Alert variant="error" title="De geplande verzending is niet gelukt">{n.scheduleError} Controleer de nieuwsbrief en plan opnieuw.</Alert>}
      {n.status === "scheduled" && (
        <section className="card" aria-labelledby="gp">
          <h2 id="gp">Gepland</h2>
          <p>Deze nieuwsbrief wordt verstuurd op <strong>{fmt(n.scheduledAt)}</strong> (Amsterdamse tijd), of bij de eerstvolgende controle daarna. De ontvangers worden op dat moment bepaald. Een geplande nieuwsbrief kan niet worden gewijzigd.</p>
          <form action={unscheduleNewsletterAction}><input type="hidden" name="id" value={id} /><button className="secondary">Planning annuleren</button></form>
        </section>
      )}
      {n.status === "sending" && stats.pending > 0 && <NewsletterProgress id={id} remaining={stats.pending} total={stats.total} />}

      {!draft && n.status !== "scheduled" && (
        <section className="card" aria-labelledby="st">
          <h2 id="st">Verzending</h2>
          <div className="stats">
            <div className="stat"><span className="muted">Ontvangers</span><strong>{n.recipientCount ?? stats.total}</strong></div>
            <div className="stat"><span className="muted">Verstuurd</span><strong>{stats.sent}</strong></div>
            <div className="stat"><span className="muted">Wachtend</span><strong>{stats.pending}</strong></div>
            <div className="stat"><span className="muted">Mislukt</span><strong>{stats.failed}</strong></div>
            <div className="stat"><span className="muted">Overgeslagen</span><strong>{stats.suppressed + stats.cancelled}</strong><span className="muted">afgemeld, testmodus of geannuleerd</span></div>
          </div>
          {stats.failed > 0 && (
            <form action={retryNewsletterAction}><input type="hidden" name="id" value={id} /><button className="secondary">Mislukte verzendingen opnieuw proberen</button></form>
          )}
          {n.status === "sending" && (
            <form action={cancelNewsletterAction} className="card">
              <h3>Verzending annuleren</h3>
              <p className="muted">Wat nog wacht wordt niet meer verstuurd. Wat al is verstuurd, blijft verstuurd.</p>
              <input type="hidden" name="id" value={id} />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Ik bevestig dat ik de verzending wil stoppen</label>
              <p><button className="danger">Annuleren</button></p>
            </form>
          )}
        </section>
      )}

      {draft && <NewsletterForm id={id} subject={n.subject} body={n.body} audience={n.audience} />}

      <section className="card" aria-labelledby="vw">
        <h2 id="vw">Voorbeeld</h2>
        <p className="muted">Zo komt de mail aan (met een voorbeeld-afmeldlink).</p>
        <iframe title="Voorbeeld van de nieuwsbrief" sandbox="" srcDoc={preview.html} style={{ width: "100%", height: 560, border: "2px solid #000", borderRadius: 10, background: "#fff" }} />
      </section>

      {draft && rec && (
        <>
          <section className="card" aria-labelledby="tm">
            <h2 id="tm">Testmail</h2>
            <p>Stuur het concept eerst naar uzelf ({s.user.email}) om opmaak en links te controleren.</p>
            <form action={testNewsletterAction}><input type="hidden" name="id" value={id} /><button className="secondary">Testmail naar mezelf</button></form>
          </section>

          <section className="card" aria-labelledby="vz">
            <h2 id="vz">Versturen</h2>
            <p>Doelgroep <strong>{AUDIENCE_LABEL[n.audience as Audience]}</strong>: <strong>{rec.emails.length}</strong> unieke e-mailadres(sen){rec.optedOut ? ` (${rec.optedOut} afgemeld en daarom overgeslagen)` : ""}. Gedeelde adressen (bijv. een gezin) ontvangen één mail.</p>
            {!live && <Alert variant="warning" title={env.emailMode === "test" ? "Testmodus" : "E-mail staat uit"}>{env.emailMode === "test" ? `Er worden hoogstens ${TEST_MODE_CAP} mails verstuurd, en uitsluitend naar het testadres. Echte ontvangers krijgen niets.` : "Er wordt niets verstuurd."}</Alert>}
            {rec.emails.length === 0 ? <p className="notice">Deze doelgroep heeft geen ontvangers.</p> : (
              <form action={sendNewsletterAction}>
                <input type="hidden" name="id" value={id} /><input type="hidden" name="expectedCount" value={rec.emails.length} />
                <p className="muted">Een verstuurde nieuwsbrief kan niet worden teruggehaald of gewijzigd. Sla eerst eventuele wijzigingen op en controleer het voorbeeld.</p>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Ik heb het voorbeeld gecontroleerd en wil nu versturen aan {rec.emails.length} ontvanger(s)</label>
                <p><button>Nieuwsbrief versturen</button></p>
              </form>
            )}
          </section>

          {rec.emails.length > 0 && (
            <section className="card" aria-labelledby="pl">
              <h2 id="pl">Plannen</h2>
              <p>Verstuur de nieuwsbrief op een later moment. De ontvangers (nu {rec.emails.length}) worden pas op het verzendmoment bepaald; afmeldingen tot dan tellen mee.</p>
              <form action={scheduleNewsletterAction}>
                <input type="hidden" name="id" value={id} />
                <label htmlFor="at">Datum en tijd (Amsterdamse tijd, minimaal {SCHEDULE_MIN_MINUTES} minuten vooruit)</label>
                <input id="at" name="at" type="datetime-local" required min={formatAmsterdamLocal(new Date(Date.now() + SCHEDULE_MIN_MINUTES * 60_000))} />
                <p className="muted">Het automatische controlemoment draait nu eenmaal per dag (rond 08:15). Een plan voor later die dag wordt daarom bij de eerstvolgende controle verstuurd, of zodra een beheerder daarna deze pagina&apos;s opent.</p>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Ik heb het voorbeeld gecontroleerd en wil de nieuwsbrief plannen</label>
                <p><button>Nieuwsbrief plannen</button></p>
              </form>
            </section>
          )}

          <form action={deleteNewsletterAction} className="card danger-zone">
            <h2>Concept verwijderen</h2>
            <input type="hidden" name="id" value={id} />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Ik bevestig dat dit concept wordt verwijderd</label>
            <p><button className="danger">Concept verwijderen</button></p>
          </form>
        </>
      )}
    </>
  );
}
