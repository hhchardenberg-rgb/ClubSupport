import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Geen verbinding" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <h1>Geen verbinding</h1>
        <div className="card" role="status">
          <p>Je bent offline. Je ledenpas staat ook in Apple Wallet of Google Wallet als je die hebt toegevoegd; die werkt op dit toestel zonder internet.</p>
          <p className="muted">Let op: de actuele geldigheid van je pas wordt altijd online gecontroleerd door de scanner.</p>
          <p><a className="btn" href="/ledenpas">Opnieuw proberen</a></p>
        </div>
      </main>
    </>
  );
}
