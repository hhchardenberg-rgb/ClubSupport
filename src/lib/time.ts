/** Tijdzone van de applicatie: Europe/Amsterdam. */
const TZ = "Europe/Amsterdam";

function offsetMs(utcMs: number): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utcMs / 1000) * 1000;
}

export function formatAmsterdamLocal(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/**
 * "JJJJ-MM-DDTUU:MM" (invoer van datetime-local) als Amsterdamse tijd → exact tijdstip (UTC).
 * Geeft null bij ongeldige invoer of een tijd die niet bestaat (zomertijd-overgang).
 */
export function amsterdamLocalToDate(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess - offsetMs(guess);
  t = guess - offsetMs(t);
  const d = new Date(t);
  return formatAmsterdamLocal(d) === local.trim() ? d : null;
}
