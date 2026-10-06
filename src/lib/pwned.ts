import { createHash } from "node:crypto";

/**
 * Controle op gelekte wachtwoorden via de Pwned Passwords-API (Have I Been Pwned) met k-anonymity:
 * alleen de eerste 5 tekens van de SHA-1-hash verlaten de server; het wachtwoord zelf nooit. `Add-Padding` maskeert het aantal treffers.
 * Geeft true (gelekt), false (niet gevonden) of null (controle niet gelukt: fail-open, zodat een storing niemand buitensluit).
 * Uit te zetten met PASSWORD_BREACH_CHECK=off.
 */
export async function isPasswordPwned(password: string, timeoutMs = 2500): Promise<boolean | null> {
  if (process.env.PASSWORD_BREACH_CHECK === "off") return null;
  const sha = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha.slice(0, 5);
  const suffix = sha.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "HHC-ClubSupport" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix) return Number(count) > 0;
    }
    return false;
  } catch {
    return null;
  }
}
