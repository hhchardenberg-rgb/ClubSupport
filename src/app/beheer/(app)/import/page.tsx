import Link from "next/link";
import { Alert, Flash, PageTitle } from "@/components/ui";
import { UploadForm } from "@/components/ImportFlow";
import { requireStaff } from "@/lib/session";
import { getBatchPreview } from "@/server/import";
import { commitImportAction } from "../actions";

export const metadata = { title: "Import" };

export default async function Page({ searchParams }: { searchParams: Promise<{ batch?: string; msg?: string; err?: string }> }) {
  const s = await requireStaff("beheer", "import");
  const sp = await searchParams;
  const preview = sp.batch ? await getBatchPreview(s.user.id, sp.batch) : null;
  return (
    <>
      <PageTitle title="Leden importeren" sub="Controleer de preview voordat er iets wordt opgeslagen of gemaild." />
      <Flash msg={sp.msg} err={sp.err} />
      {sp.batch && !preview && <Alert variant="error">Deze preview bestaat niet meer of is verlopen. Upload het bestand opnieuw.</Alert>}
      {!preview && <UploadForm />}
      {preview && (
        <>
          <section className="card" aria-labelledby="pv">
            <h2 id="pv">2. Preview</h2>
            <p>
              <strong>{preview.counts.import}</strong> rijen worden geïmporteerd · <strong>{preview.counts.error}</strong> rijen worden <strong>overgeslagen</strong> (fout) · {preview.counts.total} rijen totaal
            </p>
            {preview.groups.length > 0 && (
              <div className="notice" role="region" aria-label="Gedeelde accounts">
                <p><strong>Accountkoppelingen om te bevestigen</strong></p>
                <p>Leden met hetzelfde e-mailadres zijn geen dubbele leden: ze houden een eigen lidnummer en pas, maar komen onder één account.</p>
                <ul>
                  {preview.groups.map((g) => (
                    <li key={g.id}>
                      {g.email}: regels {g.lines.join(", ")} {g.existingAccount ? `· bestaand account met ${g.existingMembers} gekoppeld(e) lid/leden` : "· nieuw account (één uitnodiging)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          <div className="table-wrap">
          <table>
            <caption className="sr-only">Preview van de import</caption>
            <thead><tr><th scope="col">Regel</th><th scope="col">Lidnummer</th><th scope="col">Naam</th><th scope="col">E-mail</th><th scope="col">Resultaat</th></tr></thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td><td>{r.memberNumber}</td><td>{r.fullName}</td><td>{r.email}{r.group ? ` (groep ${r.group})` : ""}</td>
                  <td className="wrap">{r.status === "import" ? <span className="badge ok">Importeren</span> : <span className="badge bad">Overslaan</span>}{r.errors.length > 0 && <ul className="error">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
          <form action={commitImportAction} className="card" aria-labelledby="cf">
            <h2 id="cf">3. Bevestigen</h2>
            <input type="hidden" name="batchId" value={preview.batchId} />
            {preview.groups.length > 0 && (
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="confirmGroups" required style={{ width: 24, minHeight: 24 }} /> Ik bevestig de accountkoppelingen hierboven
              </label>
            )}
            <p className="muted">Mails worden pas verstuurd nadat alle {preview.counts.import} leden succesvol zijn opgeslagen.</p>
            <div className="row">
              <button disabled={preview.counts.import === 0}>Importeer {preview.counts.import} leden</button>
              <Link className="btn secondary" href="/beheer/import">Annuleren</Link>
            </div>
          </form>
        </>
      )}
    </>
  );
}
