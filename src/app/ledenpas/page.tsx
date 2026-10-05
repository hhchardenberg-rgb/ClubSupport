import QRCode from "qrcode";
import { InstallHelp } from "@/components/InstallHelp";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { walletStatus } from "@/lib/wallet-config";
import { requireMember } from "@/lib/session";
import { listPassesForAccount } from "@/server/accounts";
import { revealToken } from "@/server/passes";

export const metadata = { title: "Ledenpas" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await requireMember();
  const passes = await listPassesForAccount(s.user.id);
  const wallet = walletStatus();
  const cards = await Promise.all(
    passes.map(async (p) => {
      let svg: string | null = null;
      let unavailable = false;
      if (p.status === "active") {
        try {
          const token = revealToken({ id: p.passId, tokenCiphertext: p.tokenCiphertext, status: p.status });
          svg = token ? await QRCode.toString(token, { type: "svg", margin: 2, errorCorrectionLevel: "M" }) : null;
        } catch {
          // Token onleesbaar (bijv. sleutel gewijzigd): geen crash, geen token in logs.
          console.error("pass-token niet te ontsleutelen", { passId: p.passId });
          unavailable = true;
        }
      }
      return { ...p, svg, unavailable };
    }),
  );

  return (
    <>
      <SiteHeader>
        <SignOutButton to="/ledenpas/inloggen" />
      </SiteHeader>
      <main id="main">
        <h1>Ledenpas</h1>
        <p className="muted">Ingelogd als {s.user.email}</p>
        {cards.length > 1 && (
          <p className="notice">
            Dit account bevat {cards.length} ledenpassen. Iedereen met toegang tot dit account kan alle eraan gekoppelde passen zien en beheren.
          </p>
        )}
        {cards.length === 0 && (
          <div className="card" role="status">
            <h2>Geen ledenpas gevonden</h2>
            <p>Aan dit account is nog geen ledenpas gekoppeld. Neem contact op met HHC ClubSupport als je denkt dat dit niet klopt.</p>
          </div>
        )}
        {cards.map((c) => (
          <article key={c.passId} className="card" aria-labelledby={`n-${c.passId}`}>
            <h2 id={`n-${c.passId}`}>{c.fullName}</h2>
            <p>
              Lidnummer <strong>{c.memberNumber}</strong>{" "}
              {c.status === "active" ? <span className="badge ok">Actief</span> : <span className="badge bad">Niet actief</span>}
            </p>
            {c.svg ? (
              <div
                role="img"
                aria-label={`QR-code van de ledenpas van ${c.fullName}`}
                style={{ background: "#fff", maxWidth: 280, margin: "8px auto", border: "2px solid #000" }}
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
            ) : (
              <p className="notice" role="alert">
                {c.unavailable
                  ? "Deze pas kan tijdelijk niet worden getoond. Neem contact op met HHC ClubSupport."
                  : "Deze pas is niet actief en kan niet worden gebruikt. Neem contact op met HHC ClubSupport."}
              </p>
            )}
            {c.svg && (
              <>
                <div className="row">
                  {wallet.apple ? (
                    <a className="btn dark" href={`/api/wallet/apple/${c.passId}`}>Toevoegen aan Apple Wallet</a>
                  ) : (
                    <button disabled aria-describedby={`w-${c.passId}`}>Apple Wallet</button>
                  )}
                  {wallet.google ? (
                    <a className="btn dark" href={`/api/wallet/google/${c.passId}`}>Opslaan in Google Wallet</a>
                  ) : (
                    <button disabled aria-describedby={`w-${c.passId}`}>Google Wallet</button>
                  )}
                </div>
                {(!wallet.apple || !wallet.google) && (
                  <p id={`w-${c.passId}`} className="muted">
                    {!wallet.apple && !wallet.google ? "Apple Wallet en Google Wallet zijn nog niet beschikbaar." : !wallet.apple ? "Apple Wallet is nog niet beschikbaar." : "Google Wallet is nog niet beschikbaar."}
                  </p>
                )}
              </>
            )}
          </article>
        ))}
        <p className="muted">
          Je pas werkt op dit toestel ook zonder verbinding, maar de actuele geldigheid wordt altijd online gecontroleerd bij de scanner.
          Een screenshot of kopie van de QR-code is niet geheel te voorkomen: de controleur vergelijkt daarom altijd de naam.
        </p>
        <InstallHelp />
      </main>
    </>
  );
}
