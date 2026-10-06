"use server";
import { getSession } from "@/lib/session";
import { raiseSecurityEvent } from "@/server/security";

/** Meldt het account zelf dat er een beveiligingsinstelling is gewijzigd (passkey/herstelcodes). Mail naar het eigen adres. */
export async function noticeSecurityChange(kind: "passkey_added" | "passkey_removed" | "backup_codes_regenerated") {
  const s = await getSession();
  if (!s) return;
  const lines: Record<typeof kind, [string, string]> = {
    passkey_added: ["Er is een passkey toegevoegd", "Er is een passkey toegevoegd aan je HHC ClubSupport-account."],
    passkey_removed: ["Er is een passkey verwijderd", "Er is een passkey verwijderd van je HHC ClubSupport-account."],
    backup_codes_regenerated: ["Nieuwe herstelcodes aangemaakt", "Voor je HHC ClubSupport-account zijn nieuwe herstelcodes aangemaakt; de oude codes werken niet meer."],
  };
  await raiseSecurityEvent({
    type: kind, severity: "info", userId: s.user.id, dedupe: `${kind}:${s.user.id}:${Date.now()}`,
    notifyUser: { title: lines[kind][0], lines: [lines[kind][1], "Was jij dit niet? Neem dan direct contact op met een systeembeheerder of stel een nieuw wachtwoord in."] },
  }).catch(() => undefined);
}
