/**
 * Lidmaatschap: status, geldigheid en begrippen. Aparte module naast `status.ts` (pas): de status van een pas en de
 * status van een lidmaatschap worden nooit door elkaar gebruikt.
 *
 * Opgeslagen status (kolom `membership.status`, bepaald door een beheerder):
 *  - active    : lidmaatschap loopt (binnen de eventuele begin-/einddatum is het geldig).
 *  - suspended : door een beheerder geschorst; nooit geldig, ongeacht datums. Kan weer actief worden.
 *  - ended     : beëindigd; nooit geldig. Een nieuw lidmaatschap kan alleen als nieuwe regel worden aangemaakt.
 *
 * Afgeleide (effectieve) status op een bepaalde dag in de tijdzone van de applicatie (Europe/Amsterdam):
 *  - valid     : active, begindatum (indien aanwezig) is bereikt en einddatum (indien aanwezig) is nog niet voorbij.
 *                De einddatum is de LAATSTE geldige dag (inclusief).
 *  - scheduled : active, maar de begindatum ligt in de toekomst.
 *  - expired   : active, maar de einddatum is verstreken.
 *  - suspended / ended: zoals opgeslagen.
 *  - none      : het lid heeft geen enkel lidmaatschap (fail-safe: nooit geldig).
 *
 * Contributiebetaling heeft bewust GEEN invloed op deze status (afzonderlijke, nog te nemen productbeslissing).
 */
export const MEMBERSHIP_STATUSES = ["active", "suspended", "ended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export type EffectiveMembership = "valid" | "scheduled" | "expired" | "suspended" | "ended" | "none";

export const MEMBERSHIP_LABEL: Record<EffectiveMembership, string> = {
  valid: "Geldig",
  scheduled: "Nog niet gestart",
  expired: "Verlopen",
  suspended: "Geschorst",
  ended: "Beëindigd",
  none: "Geen lidmaatschap",
};

export const MEMBERSHIP_HELP: Record<EffectiveMembership, string> = {
  valid: "Het lidmaatschap loopt. In combinatie met een actieve pas is een scan geldig.",
  scheduled: "Het lidmaatschap is actief, maar de begindatum is nog niet bereikt. Scans zijn ongeldig tot die dag.",
  expired: "De einddatum is verstreken. Scans zijn ongeldig; verleng de einddatum of maak een nieuw lidmaatschap.",
  suspended: "Door een beheerder geschorst. Scans zijn ongeldig tot het weer wordt geactiveerd.",
  ended: "Beëindigd. Scans zijn ongeldig. De ledengegevens en pasgeschiedenis blijven bewaard.",
  none: "Er is geen lidmaatschap vastgelegd. Scans zijn ongeldig tot er een lidmaatschap is.",
};

export const STORED_LABEL: Record<MembershipStatus, string> = { active: "Actief", suspended: "Geschorst", ended: "Beëindigd" };

export type MembershipRow = { status: string; startDate: string | null; endDate: string | null };

/** Datum van vandaag (YYYY-MM-DD) in de tijdzone van de applicatie. */
export function amsterdamToday(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Effectieve status van één lidmaatschapsregel op `today` (YYYY-MM-DD, lexicografisch vergelijkbaar). */
export function effectiveOf(m: MembershipRow, today: string): EffectiveMembership {
  if (m.status === "ended") return "ended";
  if (m.status === "suspended") return "suspended";
  if (m.status !== "active") return "none"; // onbekende status: fail-safe
  if (m.startDate && m.startDate > today) return "scheduled";
  if (m.endDate && m.endDate < today) return "expired";
  return "valid";
}

const RANK: EffectiveMembership[] = ["valid", "scheduled", "suspended", "expired", "ended", "none"];

/** Samenvatting voor een lid met mogelijk meerdere regels (historie): "valid" als één regel nu geldig is. */
export function effectiveMembership(rows: MembershipRow[], today: string): EffectiveMembership {
  if (rows.length === 0) return "none";
  return rows.map((r) => effectiveOf(r, today)).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
}

export const isMembershipValid = (e: EffectiveMembership) => e === "valid";

/** YYYY-MM-DD → echte kalenderdatum? Accepteert ook DD-MM-YYYY (import). Geeft ISO terug of null. */
export function parseDateInput(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2100) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function formatDateNl(iso: string | null): string {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Aanvaardt YYYY-MM-DD of DD-MM-YYYY; fouten als DomainError-vriendelijke tekst (door aanroeper). */
export function validateRange(start: string | null, end: string | null): string | null {
  if (start && end && end < start) return "De einddatum ligt vóór de begindatum.";
  return null;
}

/** Aanleiding waarom een scan ongeldig is (alleen server-intern en voor het controlelogboek; niet naar de scanner). */
export type ScanBlock = "membership" | "archived" | null;
