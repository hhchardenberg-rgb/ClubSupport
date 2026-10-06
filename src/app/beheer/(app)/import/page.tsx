import Link from "next/link";
import { Alert, Flash, PageTitle } from "@/components/ui";
import { UploadForm } from "@/components/ImportFlow";
import { FIELD_KEYS, FIELD_LABEL } from "@/lib/csv";
import { requireStaff } from "@/lib/session";
import { getBatchState } from "@/server/import";
import { commitImportAction, mapImportAction, resetMappingAction } from "../actions";

export const metadata = { title: "Import" };

const ACTION: Record<string, { label: string; cls: string }> = {
  new: { label: "Nieuw", cls: "ok" },
  update: { label: "Bijwerken", cls: "warn" },
  unchanged: { label: "Ongewijzigd", cls: "" },
  error: { label: "Overslaan (fout)", cls: "bad" },
  review: { label: "Te beoordelen", cls: "warn" },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ batch?: string; msg?: string; err?: string }> }) {
  const s = await requireStaff("beheer", "import");
  const sp = await searchParams;
  const state = sp.batch ? await getBatchState(s.user.id, sp.batch) : null;
  const preview = state?.stage === "preview" ? state.preview : null;
  return (
    <>
      <PageTitle title="Leden importeren" sub="Upload, koppel de kolommen, controleer het voorbeeld en bevestig. Er wordt niets opgeslagen of gemaild voordat u bevestigt." />
      <Flash msg={sp.msg} err={sp.err} />
      {sp.batch && !state && <Alert variant="error">Deze import bestaat niet meer, is verwerkt of is verlopen. Upload het bestand opnieuw.</Alert>}
      {!state && <UploadForm />}

      {state?.stage === "mapping" && (
        <form action={mapImportAction} className="card" aria-labelledby="km">
          <h2 id="km">2. Kolommen koppelen</h2>
          <p className="muted">Kies per kolom uit uw bestand welk veld het is. Lidnummer en naam zijn verplicht. Gedeelde e-mailadressen zijn toegestaan; e-mail wordt nooit gebruikt om leden samen te voegen.</p>
          {state.unknown.length > 0 && <Alert variant="info">Niet herkende kolommen staan op &quot;Negeren&quot;: {state.unknown.join(", ")}.</Alert>}
          <input type="hidden" name="batchId" value={state.batchId} /><input type="hidden" name="cols" value={state.headers.length} />
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Kolommen van het bestand">
            <table>
              <thead><tr><th scope="col">Kolom in bestand</th><th scope="col">Voorbeeld</th><th scope="col">Veld</th></tr></thead>
              <tbody>
                {state.headers.map((h, i) => (
                  <tr key={i}>
                    <td><strong>{h || "(zonder kop)"}</strong></td>
                    <td className="wrap muted">{state.sample.map((r) => r[i] ?? "").filter(Boolean).slice(0, 2).join(" · ").slice(0, 60)}</td>
                    <td>
                      <label htmlFor={`col${i}`} className="sr-only">Veld voor kolom {h || i + 1}</label>
                      <select id={`col${i}`} name={`col${i}`} defaultValue={state.suggested.columns[i] ?? ""}>
                        <option value="">Negeren</option>
                        {FIELD_KEYS.map((k) => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label htmlFor="matchKey">Bestaande leden herkennen op</label>
          <select id="matchKey" name="matchKey" defaultValue="memberNumber">
            <option value="memberNumber">Lidnummer (aanbevolen)</option>
            <option value="externalRef">Externe referentie</option>
          </select>
          <p className="muted">Een bestaand lid wordt bijgewerkt; een nieuw lidnummer maakt een nieuw lid met pas. Herhaald importeren maakt geen dubbele leden, passen of uitnodigingen.</p>
          <p><button>Voorbeeld tonen</button></p>
        </form>
      )}

      {preview && (
        <>
          <section className="card" aria-labelledby="pv">
            <h2 id="pv">3. Voorbeeld</h2>
            <div className="stats">
              <div className="stat"><span className="muted">Nieuw</span><strong>{preview.counts.new}</strong></div>
              <div className="stat"><span className="muted">Bijwerken</span><strong>{preview.counts.update}</strong></div>
              <div className="stat"><span className="muted">Ongewijzigd</span><strong>{preview.counts.unchanged}</strong></div>
              <div className="stat"><span className="muted">Te beoordelen (mogelijk dubbel)</span><strong>{preview.counts.review}</strong></div>
              <div className="stat"><span className="muted">Fouten (overgeslagen)</span><strong>{preview.counts.error}</strong></div>
            </div>
            <p className="muted">{preview.counts.total} rijen in het bestand. Alleen nieuw en bijwerken worden verwerkt. Mogelijke dubbele personen worden <strong>nooit automatisch samengevoegd</strong>: vink hieronder per regel aan als het toch een nieuw lid is.</p>
            {preview.groups.length > 0 && (
              <div className="notice" role="region" aria-label="Gedeelde accounts">
                <p><strong>Accountkoppelingen om te bevestigen</strong></p>
                <p>Leden met hetzelfde e-mailadres zijn geen dubbele leden: ze houden een eigen lidnummer en pas, maar komen onder één account met maximaal één uitnodiging.</p>
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
          <form action={commitImportAction}>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Voorbeeld van de import">
              <table>
                <caption className="sr-only">Voorbeeld van de import</caption>
                <thead><tr><th scope="col">Regel</th><th scope="col">Lidnummer</th><th scope="col">Naam</th><th scope="col">E-mail</th><th scope="col">Lidmaatschap</th><th scope="col">Resultaat</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td><td>{r.memberNumber}</td><td>{r.fullName}</td><td>{r.email}{r.group ? ` (groep ${r.group})` : ""}</td>
                      <td className="wrap">{[r.membershipStatus, r.startDate && `vanaf ${r.startDate}`, r.endDate && `t/m ${r.endDate}`].filter(Boolean).join(" · ") || "–"}</td>
                      <td className="wrap">
                        <span className={`badge ${ACTION[r.action].cls}`}>{ACTION[r.action].label}</span>
                        {r.action === "update" && r.changes && <span className="muted"> wijzigt: {r.changes.join(", ")}</span>}
                        {r.action === "review" && (
                          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input type="checkbox" name="acceptDup" value={r.line} style={{ width: 24, minHeight: 24 }} /> Mogelijk dubbel van {r.duplicateOf}. Toch als nieuw lid importeren
                          </label>
                        )}
                        {r.errors.length > 0 && <ul className="error">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="card" aria-labelledby="bv">
              <h2 id="bv">4. Bevestigen</h2>
              <input type="hidden" name="batchId" value={preview.batchId} />
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
                <input type="checkbox" name="confirm" required style={{ width: 24, minHeight: 24 }} /> Ik heb het voorbeeld gecontroleerd: {preview.counts.new} nieuw en {preview.counts.update} bijwerken worden nu verwerkt
              </label>
              {preview.groups.length > 0 && (
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" name="confirmGroups" required style={{ width: 24, minHeight: 24 }} /> Ik bevestig de accountkoppelingen hierboven
                </label>
              )}
              <p className="muted">Mails voor nieuwe accounts worden pas verstuurd nadat alles succesvol is opgeslagen. Bestaande accounts krijgen alleen een melding.</p>
              <p className="row">
                <button disabled={preview.counts.import + preview.counts.review === 0}>Importeren</button>
                <Link className="btn secondary" href="/beheer/import">Annuleren</Link>
              </p>
            </section>
          </form>
          <form action={resetMappingAction}><input type="hidden" name="batchId" value={preview.batchId} /><button className="secondary">Kolomkoppeling aanpassen</button></form>
        </>
      )}
    </>
  );
}
