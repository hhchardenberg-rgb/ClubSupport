import QRCode from "qrcode";
import { InstallHelp } from "@/components/InstallHelp";
import { PassCarousel, type PassItem } from "@/components/PassCarousel";
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
  const items: PassItem[] = await Promise.all(
    passes.map(async (p) => {
      let svg: string | null = null;
      let unavailable = false;
      if (p.status === "active") {
        try {
          const token = revealToken({ id: p.passId, tokenCiphertext: p.tokenCiphertext, status: p.status });
          svg = token ? await QRCode.toString(token, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;
        } catch {
          // Token onleesbaar (bijv. sleutel gewijzigd): geen crash, geen token in logs.
          console.error("pass-token niet te ontsleutelen", { passId: p.passId });
          unavailable = true;
        }
      }
      return { id: p.passId, name: p.fullName, number: p.memberNumber, active: p.status === "active", svg, unavailable, apple: wallet.apple, google: wallet.google };
    }),
  );

  return (
    <>
      <SiteHeader>
        <SignOutButton to="/ledenpas/inloggen" />
      </SiteHeader>
      <main id="main">
        <h1>Ledenpas</h1>
        <p className="muted" style={{ marginTop: 0 }}>Ingelogd als {s.user.email}</p>
        {items.length > 1 && <p className="notice">Dit account bevat {items.length} ledenpassen. Veeg naar links of rechts om te wisselen. Iedereen met toegang tot dit account kan alle eraan gekoppelde passen zien en beheren.</p>}
        {items.length === 0 ? (
          <div className="card" role="status">
            <h2>Geen ledenpas gevonden</h2>
            <p>Aan dit account is nog geen ledenpas gekoppeld. Neem contact op met HHC ClubSupport als je denkt dat dit niet klopt.</p>
          </div>
        ) : (
          <PassCarousel items={items} />
        )}
        <p className="muted" style={{ fontSize: ".95rem" }}>
          Zonder internet kun je je pas tonen via Apple Wallet of Google Wallet, als je die hebt toegevoegd. De actuele geldigheid wordt altijd online gecontroleerd bij de scanner. Een screenshot of kopie van de QR-code is niet geheel te voorkomen: de controleur vergelijkt daarom altijd de naam.
        </p>
        <InstallHelp />
      </main>
    </>
  );
}
