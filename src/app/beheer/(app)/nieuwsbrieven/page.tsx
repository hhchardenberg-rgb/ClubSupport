import Link from "next/link";
import { Alert, Badge, EmptyState, Flash, PageTitle } from "@/components/ui";
import { env } from "@/lib/env";
import { NEWSLETTER_STATUS } from "@/lib/newsletter-status";
import { requireStaff } from "@/lib/session";
import { AUDIENCE_LABEL, countOptouts, dispatchDueNewsletters, listNewsletters, type Audience } from "@/server/newsletter";

export const metadata = { title: "Nieuwsbrieven" };
const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(d) : "–");
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireStaff("beheer", "newsletter.manage");
  const sp = await searchParams;
  await dispatchDueNewsletters().catch(() => undefined);
  const [items, optouts] = await Promise.all([listNewsletters(), countOptouts()]);
  return (
    <>
      <PageTitle title="Nieuwsbrieven" sub={`${optouts} afgemelde adres(sen). Afgemelde adressen ontvangen nooit meer een nieuwsbrief.`} actions={<Link className="btn" href="/beheer/nieuwsbrieven/nieuw">Nieuwe nieuwsbrief</Link>} />
      <Flash msg={sp.msg} err={sp.err} />
      {env.emailMode !== "live" && <Alert variant="warning" title={env.emailMode === "test" ? "E-mail staat in testmodus" : "E-mail staat uit"}>{env.emailMode === "test" ? "Nieuwsbrieven worden niet naar echte leden verstuurd: er gaan hoogstens 3 mails naar het testadres." : "Er wordt niets verstuurd."}</Alert>}
      {items.length === 0 ? (
        <EmptyState title="Nog geen nieuwsbrieven">Maak een eerste nieuwsbrief aan, stuur een testmail naar uzelf en verstuur daarna naar leden of oud-leden.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Nieuwsbrieven</caption>
            <thead><tr><th scope="col">Onderwerp</th><th scope="col">Status</th><th scope="col">Doelgroep</th><th scope="col">Ontvangers</th><th scope="col">Verstuurd</th></tr></thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id}>
                  <td className="wrap"><Link href={`/beheer/nieuwsbrieven/${n.id}`}>{n.subject}</Link></td>
                  <td><Badge tone={NEWSLETTER_STATUS[n.status]?.tone ?? "plain"}>{NEWSLETTER_STATUS[n.status]?.label ?? n.status}</Badge></td>
                  <td>{AUDIENCE_LABEL[n.audience as Audience] ?? n.audience}</td>
                  <td>{n.recipientCount ?? "–"}</td>
                  <td>{n.status === "scheduled" ? `Gepland: ${fmt(n.scheduledAt)}` : fmt(n.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
