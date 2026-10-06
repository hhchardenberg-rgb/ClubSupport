import { saveNewsletterAction } from "@/app/beheer/(app)/nieuwsbrieven/actions";
import { NEWSLETTER_LIMITS } from "@/server/email/newsletter-render";
import { AUDIENCE_HELP, AUDIENCE_LABEL, AUDIENCES } from "@/server/newsletter";

/** Redactieformulier (server component; opslaan via server action). */
export function NewsletterForm({ id, subject = "", body = "", audience = "members" }: { id?: string; subject?: string; body?: string; audience?: string }) {
  return (
    <form action={saveNewsletterAction} className="card" aria-labelledby="nf">
      <h2 id="nf">Inhoud</h2>
      {id && <input type="hidden" name="id" value={id} />}
      <label htmlFor="subject">Onderwerp</label>
      <input id="subject" name="subject" required maxLength={NEWSLETTER_LIMITS.subject} defaultValue={subject} />
      <label htmlFor="audience">Doelgroep</label>
      <select id="audience" name="audience" defaultValue={audience} aria-describedby="aud-help">
        {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
      </select>
      <p id="aud-help" className="muted">{AUDIENCES.map((a) => `${AUDIENCE_LABEL[a]}: ${AUDIENCE_HELP[a]}`).join(" · ")}</p>
      <label htmlFor="body">Tekst</label>
      <textarea id="body" name="body" required rows={14} maxLength={NEWSLETTER_LIMITS.body} defaultValue={body} aria-describedby="body-help" className="editor" />
      <p id="body-help" className="muted">
        Schrijf gewone tekst. Lege regel = nieuwe alinea · <code>## Kop</code> = tussenkop · regels met <code>- </code> = opsomming · <code>**vet**</code> · <code>[tekst](https://adres)</code> of een los https-adres = link. HTML wordt niet overgenomen. Onderaan komt automatisch een afmeldlink.
      </p>
      <p><button>Concept opslaan</button></p>
    </form>
  );
}
