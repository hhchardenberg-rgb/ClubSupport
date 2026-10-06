/**
 * CSV-verwerking voor ledenimport. ALLE waarden zijn onbetrouwbare invoer:
 * ze worden alleen als tekst verwerkt/gerenderd (React escaped), nooit als HTML of formule.
 */
import { parseDateInput } from "./membership";

export const CSV_MAX_BYTES = 1024 * 1024; // 1 MB
export const CSV_MAX_ROWS = 5000;
export const FIELD_LIMITS = { memberNumber: 32, fullName: 120, email: 254, membershipNote: 300, externalRef: 64, membershipStatus: 24, startDate: 16, endDate: 16 } as const;
export type FieldKey = keyof typeof FIELD_LIMITS;
export const FIELD_KEYS = Object.keys(FIELD_LIMITS) as FieldKey[];
export const FIELD_LABEL: Record<FieldKey, string> = {
  memberNumber: "Lidnummer",
  fullName: "Naam",
  email: "E-mailadres",
  membershipNote: "Notitie",
  externalRef: "Externe referentie",
  membershipStatus: "Lidmaatschapsstatus",
  startDate: "Begindatum lidmaatschap",
  endDate: "Einddatum lidmaatschap",
};

/** Herkende kolomkoppen (hoofdletter-ongevoelig) → veld. In het koppelscherm kan de beheerder dit aanpassen. */
const COLUMN_ALIASES: Record<string, FieldKey> = {
  lidnummer: "memberNumber",
  naam: "fullName",
  email: "email",
  "e-mail": "email",
  notitie: "membershipNote",
  externe_referentie: "externalRef",
  "externe referentie": "externalRef",
  referentie: "externalRef",
  lidmaatschap: "membershipStatus",
  lidmaatschapsstatus: "membershipStatus",
  status: "membershipStatus",
  begindatum: "startDate",
  startdatum: "startDate",
  einddatum: "endDate",
};
export const ALLOWED_COLUMNS = ["lidnummer", "naam", "email", "notitie", "externe_referentie", "lidmaatschap", "begindatum", "einddatum"] as const;

export class CsvError extends Error {}

/** RFC 4180-parser (aanhalingstekens, ; of , als scheidingsteken, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const firstLine = t.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === "") inQuotes = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > CSV_MAX_ROWS + 1) throw new CsvError(`Maximaal ${CSV_MAX_ROWS} rijen per import`);
    } else cell += c;
  }
  if (inQuotes) throw new CsvError("Ongeldig CSV-bestand: niet-afgesloten aanhalingsteken");
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export type ParsedRow = {
  line: number; // regelnummer in het bestand (kop = 1)
  memberNumber: string;
  fullName: string;
  email: string;
  membershipNote: string;
  externalRef: string;
  /** Genormaliseerd: "" (niet opgegeven) of active | suspended | ended */
  membershipStatus: "" | "active" | "suspended" | "ended";
  /** ISO-datums (JJJJ-MM-DD) of "" */
  startDate: string;
  endDate: string;
  errors: string[];
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const STATUS_ALIASES: Record<string, ParsedRow["membershipStatus"]> = {
  actief: "active", active: "active",
  geschorst: "suspended", suspended: "suspended",
  beeindigd: "ended", "beëindigd": "ended", ended: "ended",
};

/** Eerste voorstel voor de kolomkoppeling op basis van de kopregel; onbekende kolommen komen in `unknown`. */
export function suggestMapping(header: string[]) {
  const used = new Set<FieldKey>();
  const unknown: string[] = [];
  const columns = header.map((h) => {
    const f = COLUMN_ALIASES[h.trim().toLowerCase()];
    if (!f) {
      if (h.trim()) unknown.push(h.trim().slice(0, 30));
      return "" as const;
    }
    if (used.has(f)) return "" as const;
    used.add(f);
    return f;
  });
  return { columns, unknown };
}

/** Bouwt gevalideerde rijen uit een tabel (zonder kopregel) met een expliciete kolomkoppeling. */
export function buildRows(table: string[][], columns: (FieldKey | "")[], isValidEmail: (e: string) => boolean, normalizeEmail: (e: string) => string): ParsedRow[] {
  const idx = (f: FieldKey) => columns.findIndex((c) => c === f);
  const rows: ParsedRow[] = [];
  const seenNumbers = new Map<string, number>();
  const seenRefs = new Map<string, number>();
  table.forEach((cells, i) => {
    const get = (f: FieldKey) => (idx(f) >= 0 ? (cells[idx(f)] ?? "").trim() : "");
    const r: ParsedRow = { line: i + 2, memberNumber: get("memberNumber"), fullName: get("fullName"), email: get("email"), membershipNote: get("membershipNote"), externalRef: get("externalRef"), membershipStatus: "", startDate: "", endDate: "", errors: [] };
    const rawStatus = get("membershipStatus");
    const rawStart = get("startDate");
    const rawEnd = get("endDate");
    if (cells.length > columns.length) r.errors.push("Te veel kolommen in deze rij");
    for (const f of ["memberNumber", "fullName", "email", "membershipNote", "externalRef"] as const) {
      if (CONTROL.test(r[f])) r.errors.push(`Ongeldige tekens in ${FIELD_LABEL[f].toLowerCase()}`);
      if (r[f].length > FIELD_LIMITS[f]) r.errors.push(`${FIELD_LABEL[f]} is te lang (max ${FIELD_LIMITS[f]})`);
    }
    if (!r.memberNumber) r.errors.push("Lidnummer ontbreekt");
    else if (!/^[A-Za-z0-9._\-/]+$/.test(r.memberNumber)) r.errors.push("Lidnummer mag alleen letters, cijfers en . _ - / bevatten");
    if (!r.fullName) r.errors.push("Naam ontbreekt");
    if (r.email) {
      if (!isValidEmail(r.email)) r.errors.push("Ongeldig e-mailadres");
      else r.email = normalizeEmail(r.email);
    }
    if (r.externalRef && !/^[A-Za-z0-9._\-/:]+$/.test(r.externalRef)) r.errors.push("Externe referentie mag alleen letters, cijfers en . _ - / : bevatten");
    if (rawStatus) {
      const st = STATUS_ALIASES[rawStatus.toLowerCase()];
      if (!st) r.errors.push("Onbekende lidmaatschapsstatus (gebruik actief, geschorst of beëindigd)");
      else r.membershipStatus = st;
    }
    for (const [raw, key, label] of [[rawStart, "startDate", "begindatum"], [rawEnd, "endDate", "einddatum"]] as const) {
      if (!raw) continue;
      const d = parseDateInput(raw);
      if (!d) r.errors.push(`Ongeldige ${label} (gebruik JJJJ-MM-DD of DD-MM-JJJJ)`);
      else r[key] = d;
    }
    if (r.startDate && r.endDate && r.endDate < r.startDate) r.errors.push("Einddatum ligt vóór de begindatum");
    if (r.memberNumber) {
      const prev = seenNumbers.get(r.memberNumber.toLowerCase());
      if (prev) r.errors.push(`Dubbel lidnummer in bestand (ook op regel ${prev})`);
      else seenNumbers.set(r.memberNumber.toLowerCase(), r.line);
    }
    if (r.externalRef) {
      const prev = seenRefs.get(r.externalRef.toLowerCase());
      if (prev) r.errors.push(`Dubbele externe referentie in bestand (ook op regel ${prev})`);
      else seenRefs.set(r.externalRef.toLowerCase(), r.line);
    }
    rows.push(r);
  });
  return rows;
}

/** Strikte variant (herkende kolommen vereist): onbekende of dubbele kolommen en ontbrekende verplichte kolommen zijn een fout. */
export function parseMemberCsv(text: string, isValidEmail: (e: string) => boolean, normalizeEmail: (e: string) => string) {
  const table = parseCsv(text);
  if (table.length === 0) throw new CsvError("Het bestand is leeg");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const { columns, unknown } = suggestMapping(header);
  if (unknown.length) throw new CsvError(`Onbekende kolom(men): ${unknown.join(", ")}. Toegestaan: ${ALLOWED_COLUMNS.join(", ")}`);
  if (new Set(header.filter(Boolean)).size !== header.filter(Boolean).length) throw new CsvError("Dubbele kolomnamen in de kop");
  for (const need of ["memberNumber", "fullName"] as const) if (!columns.includes(need)) throw new CsvError(`Verplichte kolom ontbreekt: ${need === "memberNumber" ? "lidnummer" : "naam"}`);
  if (table.length - 1 > CSV_MAX_ROWS) throw new CsvError(`Maximaal ${CSV_MAX_ROWS} rijen per import`);
  return buildRows(table.slice(1), columns, isValidEmail, normalizeEmail);
}

/**
 * Neutraliseert spreadsheet-formule-injectie voor exports: waarden die met = + - @ tab of CR beginnen
 * krijgen een apostrof, en alle velden worden veilig tussen aanhalingstekens gezet.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
