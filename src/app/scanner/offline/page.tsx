import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Geen verbinding" };

export default function Page() {
  return (
    <>
      <SiteHeader area="scanner" />
      <main id="main">
        <section role="alert" style={{ background: "#ff6600", border: "8px solid #000", borderRadius: 8, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontWeight: 900 }}>Niet gecontroleerd</h1>
          <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>Verbinding nodig</p>
          <p>Scannen werkt alleen online. Er wordt geen pas als geldig getoond zonder controle bij de server.</p>
          <p><a className="btn dark" href="/scanner">Opnieuw proberen</a></p>
        </section>
      </main>
    </>
  );
}
