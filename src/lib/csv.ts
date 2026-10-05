/**
 * CSV-verwerking voor ledenimport. ALLE waarden zijn onbetrouwbare invoer:
 * ze worden alleen als tekst verwerkt/gerenderd (React escaped), nooit als HTML of formule.
 */
export const CSV_MAX_BYTES = 1024 * 1024; // 1 MB
export const CSV_MAX_ROWS = 5000;
export const FIELD_LIMITS = { memberNumber: 32, fullName: 120, email: 254, membershipNote: 300 } as const;

/** Toegestane kolommen en hun aliassen (hoofdletter-ongevoelig). */
const COLUMN_ALIASES: Record<string, keyof typeof FIELD_LIMITS> = {
  lidnummer: "memberNumber",
  naam: "fullName",
  email: "email",
  "e-mail": "email",
  notitie: "membershipNote",
};
export const ALLOWED_COLUMNS = ["lidnummer", "naam", "email", "notitie"] as const;

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
  errors: string[];
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function parseMemberCsv(text: string, isValidEmail: (e: string) => boolean, normalizeEmail: (e: string) => string) {
  const table = parseCsv(text);
  if (table.length === 0) throw new CsvError("Het bestand is leeg");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const unknown = header.filter((h) => h && !(h in COLUMN_ALIASES));
  if (unknown.length) throw new CsvError(`Onbekende kolom(men): ${unknown.map((u) => u.slice(0, 30)).join(", ")}. Toegestaan: ${ALLOWED_COLUMNS.join(", ")}`);
  if (new Set(header.filter(Boolean)).size !== header.filter(Boolean).length) throw new CsvError("Dubbele kolomnamen in de kop");
  const idx = (f: keyof typeof FIELD_LIMITS) => header.findIndex((h) => COLUMN_ALIASES[h] === f);
  for (const need of ["memberNumber", "fullName"] as const) if (idx(need) < 0) throw new CsvError(`Verplichte kolom ontbreekt: ${need === "memberNumber" ? "lidnummer" : "naam"}`);
  if (table.length - 1 > CSV_MAX_ROWS) throw new CsvError(`Maximaal ${CSV_MAX_ROWS} rijen per import`);

  const rows: ParsedRow[] = [];
  const seenNumbers = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const get = (f: keyof typeof FIELD_LIMITS) => (idx(f) >= 0 ? (cells[idx(f)] ?? "").trim() : "");
    const r: ParsedRow = { line: i + 2, memberNumber: get("memberNumber"), fullName: get("fullName"), email: get("email"), membershipNote: get("membershipNote"), errors: [] };
    if (cells.length > header.length) r.errors.push("Te veel kolommen in deze rij");
    for (const f of Object.keys(FIELD_LIMITS) as (keyof typeof FIELD_LIMITS)[]) {
      if (CONTROL.test(r[f])) r.errors.push(`Ongeldige tekens in ${f === "memberNumber" ? "lidnummer" : f === "fullName" ? "naam" : f}`);
      if (r[f].length > FIELD_LIMITS[f]) r.errors.push(`${f === "memberNumber" ? "Lidnummer" : f === "fullName" ? "Naam" : f} is te lang (max ${FIELD_LIMITS[f]})`);
    }
    if (!r.memberNumber) r.errors.push("Lidnummer ontbreekt");
    else if (!/^[A-Za-z0-9._\-/]+$/.test(r.memberNumber)) r.errors.push("Lidnummer mag alleen letters, cijfers en . _ - / bevatten");
    if (!r.fullName) r.errors.push("Naam ontbreekt");
    if (r.email) {
      if (!isValidEmail(r.email)) r.errors.push("Ongeldig e-mailadres");
      else r.email = normalizeEmail(r.email);
    }
    if (r.memberNumber) {
      const prev = seenNumbers.get(r.memberNumber.toLowerCase());
      if (prev) r.errors.push(`Dubbel lidnummer in bestand (ook op regel ${prev})`);
      else seenNumbers.set(r.memberNumber.toLowerCase(), r.line);
    }
    rows.push(r);
  });
  return rows;
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
