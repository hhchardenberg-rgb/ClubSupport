import QRCode from "qrcode";
import { InstallHelp } from "@/components/InstallHelp";
import { OfflineSync, OfflineToggle } from "@/components/OfflineSync";
import { env } from "@/lib/env";
import { PassCarousel, type PassItem } from "@/components/PassCarousel";
import { SiteHeader } from "@/components/SiteHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { requireMember } from "@/lib/session";
import { listMembersForAccount } from "@/server/accounts";
import { formatDateNl, isFormerMember, MEMBERSHIP_LABEL } from "@/lib/membership";
import { revealToken } from "@/server/passes";

export const metadata = { title: "Ledenpas" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await requireMember();
  const members = await listMembersForAccount(s.user.id);
  const items: PassItem[] = await Promise.all(
    members.map(async (p) => {
      let svg: string | null = null;
      let unavailable = false;
      if (p.valid && p.passId) {
        try {
          const token = revealToken({ id: p.passId, tokenCiphertext: p.tokenCiphertext, status: p.passStatus ?? "active" });
          svg = token ? await QRCode.toString(token, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null;
        } catch {
          // Token onleesbaar (bijv. sleutel gewijzigd): geen crash, geen token in logs.
          console.error("pass-token niet te ontsleutelen", { passId: p.passId });
          unavailable = true;
        }
      }
      const range = p.membershipStart || p.membershipEnd ? ` · ${p.membershipStart ? `vanaf ${formatDateNl(p.membershipStart)}` : ""}${p.membershipStart && p.membershipEnd ? " " : ""}${p.membershipEnd ? `t/m ${formatDateNl(p.membershipEnd)}` : ""}` : "";
      const reason: PassItem["reason"] = !p.passId ? "nopass" : p.membership !== "valid" ? "membership" : "pass";
      return { id: p.passId ?? `lid-${p.memberId}`, name: p.fullName, number: p.memberNumber, active: p.valid, svg, unavailable, reason, membershipLabel: `${isFormerMember(p.membership) ? "Oud-lid · " : ""}${MEMBERSHIP_LABEL[p.membership]}${range}` };
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
        {items.length > 1 && <p className="notice">Dit account is gekoppeld aan {items.length} leden. Veeg naar links of rechts om te wisselen. Iedereen met toegang tot dit account kan alle eraan gekoppelde passen zien en gebruiken.</p>}
        {items.length > 0 && (
          <details className="card">
            <summary>Gekoppelde leden ({items.length})</summary>
            <ul>{items.map((i) => <li key={i.id}><strong>{i.name}</strong> (lidnummer {i.number}) · lidmaatschap: {i.membershipLabel} · {i.active ? "pas geldig" : "pas niet geldig"}</li>)}</ul>
            <p className="muted">Is een koppeling niet juist? Neem contact op met HHC ClubSupport; alleen een beheerder wijzigt koppelingen.</p>
          </details>
        )}
        {items.length === 0 ? (
          <div className="card" role="status">
            <h2>Geen ledenpas gevonden</h2>
            <p>Aan dit account is nog geen ledenpas gekoppeld. Neem contact op met HHC ClubSupport als je denkt dat dit niet klopt.</p>
          </div>
        ) : (
          <PassCarousel items={items} />
        )}
        <p className="muted" style={{ fontSize: ".95rem" }}>
          De actuele geldigheid wordt altijd online gecontroleerd bij de scanner. Een screenshot of kopie van de QR-code is niet geheel te voorkomen: de controleur vergelijkt daarom altijd de naam.
        </p>
        {items.length > 0 && <OfflineToggle items={items} maxDays={env.offlinePassMaxDays} />}
        {items.length > 0 && <OfflineSync items={items} maxDays={env.offlinePassMaxDays} />}
        <InstallHelp />
      </main>
    </>
  );
}
