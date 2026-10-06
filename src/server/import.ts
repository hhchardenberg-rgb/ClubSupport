import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { buildRows, CsvError, CSV_MAX_ROWS, FIELD_KEYS, FIELD_LABEL, parseCsv, suggestMapping, type FieldKey, type ParsedRow } from "@/lib/csv";
import { createMemberWithPassTx, isValidEmail, normalizeEmail } from "./accounts";
import { createMembershipTx } from "./memberships";
import { DomainError } from "./passes";
import { processOutbox } from "./email/outbox";

/**
 * Importflow in twee stappen, daarna bevestigen:
 *  1. upload  → ruwe tabel tijdelijk bewaard (verloopt na 1 uur, gewist na verwerken);
 *  2. koppeling → beheerder wijst kolommen toe aan velden en kiest de matchsleutel (lidnummer of externe referentie);
 *  3. voorbeeld → per rij: nieuw / bijwerken / ongewijzigd / fout / mogelijk dubbel; pas na expliciete bevestiging verwerkt.
 * Nooit automatisch samenvoegen op e-mail of naam; e-mail is geen matchsleutel.
 */
export type MatchKey = "memberNumber" | "externalRef";
export type Mapping = { columns: (FieldKey | "")[]; matchKey: MatchKey };

export type RowAction = "new" | "update" | "unchanged" | "error" | "review";
export type PreviewRow = ParsedRow & {
  /** import: wordt verwerkt (nieuw/bijwerken) · unchanged: al gelijk · error: overgeslagen · review: mogelijk dubbele persoon, alleen op expliciete keuze */
  status: "import" | "unchanged" | "error" | "review";
  action: RowAction;
  changes?: string[];
  existingNumber?: string;
  duplicateOf?: string;
  group?: number;
};
export type PreviewGroup = { id: number; email: string; lines: number[]; existingAccount: boolean; existingMembers: number };
export type Preview = {
  batchId: string;
  rows: PreviewRow[];
  groups: PreviewGroup[];
  counts: { total: number; import: number; error: number; groups: number; new: number; update: number; unchanged: number; review: number };
};
export type BatchState =
  | { stage: "mapping"; batchId: string; headers: string[]; sample: string[][]; suggested: Mapping; unknown: string[] }
  | { stage: "preview"; preview: Preview; mapping: Mapping };

const BATCH_TTL_MS = 60 * 60 * 1000;

export async function startImport(actor: string, text: string) {
  const table = parseCsv(text);
  if (table.length === 0) throw new CsvError("Het bestand is leeg");
  if (table.length - 1 > CSV_MAX_ROWS) throw new CsvError(`Maximaal ${CSV_MAX_ROWS} rijen per import`);
  if (table.length < 2) throw new CsvError("Het bestand bevat geen gegevensrijen");
  const [batch] = await db.insert(schema.importBatch).values({ createdBy: actor, expiresAt: new Date(Date.now() + BATCH_TTL_MS), raw: table, rows: null }).returning({ id: schema.importBatch.id });
  await audit({ actor, action: "import.upload", targetType: "import", targetId: batch.id, metadata: { rows: table.length - 1, columns: table[0].length } });
  const { columns, unknown } = suggestMapping(table[0]);
  return { batchId: batch.id, headers: table[0], suggested: { columns, matchKey: "memberNumber" as MatchKey }, unknown };
}

const normName = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Maakt het voorbeeld voor een batch met een expliciete kolomkoppeling. Er wordt nog NIETS aangemaakt of gemaild. */
export async function previewMapped(actor: string, batchId: string, mapping: Mapping): Promise<Preview> {
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) throw new DomainError("not_found", "Import niet gevonden");
  const [b] = await db.select().from(schema.importBatch).where(eq(schema.importBatch.id, batchId));
  if (!b || b.createdBy !== actor || b.committedAt || !b.raw || b.expiresAt < new Date()) throw new DomainError("not_found", "Import niet gevonden of verlopen. Upload het bestand opnieuw.");
  const table = b.raw;
  const columns = mapping.columns.slice(0, table[0].length);
  while (columns.length < table[0].length) columns.push("");
  const picked = columns.filter(Boolean);
  if (new Set(picked).size !== picked.length) throw new DomainError("mapping", "Een veld is aan meer dan één kolom gekoppeld.");
  for (const f of picked) if (!FIELD_KEYS.includes(f as FieldKey)) throw new DomainError("mapping", "Ongeldige kolomkoppeling.");
  for (const need of ["memberNumber", "fullName"] as const) if (!picked.includes(need)) throw new DomainError("mapping", `Koppel een kolom aan ${FIELD_LABEL[need].toLowerCase()} (verplicht).`);
  const matchKey: MatchKey = mapping.matchKey === "externalRef" ? "externalRef" : "memberNumber";
  if (matchKey === "externalRef" && !picked.includes("externalRef")) throw new DomainError("mapping", "Koppel een kolom aan externe referentie om daarop te matchen.");

  const parsed = buildRows(table.slice(1), columns, isValidEmail, normalizeEmail);

  // Bestaande leden ophalen op lidnummer én (indien gekozen) externe referentie.
  const numbers = parsed.map((r) => r.memberNumber.toLowerCase()).filter(Boolean);
  const refs = parsed.map((r) => r.externalRef).filter(Boolean);
  const byNumber = numbers.length ? await db.select().from(schema.member).where(inArray(sql`lower(${schema.member.memberNumber})`, numbers)) : [];
  const byRef = refs.length ? await db.select().from(schema.member).where(inArray(schema.member.externalRef, refs)) : [];
  const numberMap = new Map(byNumber.map((m) => [m.memberNumber.toLowerCase(), m]));
  const refMap = new Map(byRef.map((m) => [m.externalRef!, m]));
  const memberIds = [...new Set([...byNumber, ...byRef].map((m) => m.id))];
  const msRows = memberIds.length ? await db.select().from(schema.membership).where(inArray(schema.membership.memberId, memberIds)) : [];

  const rows: PreviewRow[] = parsed.map((r) => ({ ...r, status: "import", action: "new" }));
  const fail = (r: PreviewRow, msg: string) => {
    r.errors.push(msg);
  };

  for (const r of rows) {
    if (r.errors.length) continue;
    const hit = matchKey === "externalRef" ? (r.externalRef ? refMap.get(r.externalRef) : undefined) : numberMap.get(r.memberNumber.toLowerCase());
    if (matchKey === "externalRef" && !r.externalRef) {
      fail(r, "Externe referentie ontbreekt (gekozen als matchsleutel)");
      continue;
    }
    // Het andere uniekheidsveld mag niet bij een ander lid horen.
    const otherNumber = numberMap.get(r.memberNumber.toLowerCase());
    const otherRef = r.externalRef ? refMap.get(r.externalRef) : undefined;
    if (hit) {
      if (hit.deletedAt) { fail(r, "Dit lid is verwijderd en kan niet worden bijgewerkt"); continue; }
      if (hit.archivedAt) { fail(r, "Dit lid is gearchiveerd; herstel het lid eerst voordat u het bijwerkt"); continue; }
      if (hit.memberNumber.toLowerCase() !== r.memberNumber.toLowerCase()) { fail(r, "Het lidnummer wijkt af van het bestaande lid; een lidnummer wijzigt alleen via een expliciete beheeractie"); continue; }
      if (otherRef && otherRef.id !== hit.id) { fail(r, "Externe referentie hoort al bij een ander lid"); continue; }
      r.existingNumber = hit.memberNumber;
      const changes: string[] = [];
      if (r.fullName !== hit.fullName) changes.push(FIELD_LABEL.fullName);
      if (r.email && r.email !== (hit.email ?? "")) changes.push(FIELD_LABEL.email);
      if (r.membershipNote && r.membershipNote !== (hit.membershipNote ?? "")) changes.push(FIELD_LABEL.membershipNote);
      if (r.externalRef && r.externalRef !== (hit.externalRef ?? "")) changes.push(FIELD_LABEL.externalRef);
      const open = msRows.find((x) => x.memberId === hit.id && x.status !== "ended");
      if ((r.membershipStatus || r.startDate || r.endDate)) {
        const wantStatus = r.membershipStatus || open?.status || "active";
        if (!open || wantStatus !== open.status || (r.startDate && r.startDate !== open.startDate) || (r.endDate && r.endDate !== open.endDate)) changes.push("Lidmaatschap");
      }
      r.action = changes.length ? "update" : "unchanged";
      r.status = changes.length ? "import" : "unchanged";
      r.changes = changes;
    } else {
      if (otherNumber) { fail(r, "Lidnummer bestaat al bij een ander lid (kies lidnummer als matchsleutel of corrigeer het bestand)"); continue; }
      if (otherRef) { fail(r, "Externe referentie bestaat al bij een ander lid"); continue; }
      r.action = "new";
    }
  }

  // Mogelijke dubbele personen: zelfde naam (genormaliseerd) bij een ander lidnummer. NOOIT automatisch samenvoegen.
  const newRows = rows.filter((r) => !r.errors.length && r.action === "new");
  const names = [...new Set(newRows.map((r) => normName(r.fullName)))];
  const sameName = names.length
    ? (await db.execute(sql`select member_number, full_name from member where deleted_at is null`)).rows as { member_number: string; full_name: string }[]
    : [];
  const existingByName = new Map<string, string>();
  for (const m of sameName) existingByName.set(normName(m.full_name), m.member_number);
  const seen = new Map<string, number>();
  for (const r of newRows) {
    const n = normName(r.fullName);
    const ex = existingByName.get(n);
    if (ex) { r.status = "review"; r.action = "review"; r.duplicateOf = `bestaand lid ${ex}`; }
    else if (seen.has(n)) { r.status = "review"; r.action = "review"; r.duplicateOf = `regel ${seen.get(n)} in dit bestand`; }
    else seen.set(n, r.line);
  }
  for (const r of rows) if (r.errors.length) { r.status = "error"; r.action = "error"; }

  // Gedeeld e-mailadres: groeperen (alleen nieuwe rijen die een account kunnen aanmaken/koppelen). Gedeeld adres ≠ dubbel lid.
  const byEmail = new Map<string, PreviewRow[]>();
  for (const r of rows) if (r.status === "import" && r.action === "new" && r.email) byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r]);
  const emails = [...byEmail.keys()];
  const existing = emails.length ? await db.select().from(schema.user).where(inArray(schema.user.email, emails)) : [];
  const existingByEmail = new Map(existing.map((u) => [u.email, u]));
  for (const [email, rs] of byEmail) {
    const u = existingByEmail.get(email);
    if (u && u.role !== "member") for (const r of rs) { r.errors.push("Dit e-mailadres hoort bij een staf-account"); r.status = "error"; r.action = "error"; }
  }
  const groups: PreviewGroup[] = [];
  const groupOf = new Map<string, number>();
  for (const [email, rs] of byEmail) {
    const ok = rs.filter((r) => r.status === "import");
    const u = existingByEmail.get(email);
    if (ok.length > 1 || (u && ok.length)) {
      const existingMembers = u ? Number((await db.execute(sql`select count(*) as c from account_member_access where user_id = ${u.id} and revoked_at is null`)).rows[0].c) : 0;
      const id = groups.length + 1;
      groups.push({ id, email, lines: ok.map((r) => r.line), existingAccount: !!u, existingMembers });
      groupOf.set(email, id);
    }
  }
  for (const r of rows) if (r.email && r.action === "new") r.group = groupOf.get(r.email);

  const c = (a: RowAction) => rows.filter((r) => r.action === a).length;
  const counts = { total: rows.length, import: rows.filter((r) => r.status === "import").length, error: c("error"), groups: groups.length, new: c("new"), update: c("update"), unchanged: c("unchanged"), review: c("review") };
  await db.update(schema.importBatch).set({ rows: rows as unknown[], mapping: { columns, matchKey }, counts }).where(eq(schema.importBatch.id, batchId));
  await audit({ actor, action: "import.preview", targetType: "import", targetId: batchId, metadata: counts });
  return { batchId, rows, groups, counts };
}

/** Upload + automatische koppeling + voorbeeld in één stap (voor scripts/tests). Onbekende kolommen zijn dan een fout. */
export async function previewImport(actor: string, text: string, opts: { matchKey?: MatchKey; ignoreUnknown?: boolean } = {}): Promise<Preview> {
  const s = await startImport(actor, text);
  if (s.unknown.length && !opts.ignoreUnknown) throw new CsvError(`Onbekende kolom(men): ${s.unknown.join(", ")}`);
  for (const need of ["memberNumber", "fullName"] as const) if (!s.suggested.columns.includes(need)) throw new CsvError(`Verplichte kolom ontbreekt: ${need === "memberNumber" ? "lidnummer" : "naam"}`);
  try {
    return await previewMapped(actor, s.batchId, { columns: s.suggested.columns, matchKey: opts.matchKey ?? "memberNumber" });
  } catch (e) {
    if (e instanceof DomainError && e.code === "mapping") throw new CsvError(e.message);
    throw e;
  }
}

async function applyMembershipTx(tx: Tx, actor: string, memberId: string, r: PreviewRow) {
  const [open] = await tx.select().from(schema.membership).where(and(eq(schema.membership.memberId, memberId), sql`${schema.membership.status} in ('active','suspended')`)).for("update");
  const status = r.membershipStatus || open?.status || "active";
  if (!open) {
    if (status === "ended") return; // er is niets lopends om te beëindigen
    await createMembershipTx(tx, actor, memberId, { status: status as "active" | "suspended", startDate: r.startDate || null, endDate: r.endDate || null });
    return;
  }
  const next = { status, startDate: r.startDate || open.startDate, endDate: r.endDate || open.endDate };
  await tx.update(schema.membership).set({ ...next, updatedAt: new Date() }).where(eq(schema.membership.id, open.id));
  await audit({ actor, action: "membership.update", targetType: "member", targetId: memberId, metadata: { membershipId: open.id, from: open.status, to: status, via: "import" } }, tx);
}

/**
 * Verwerkt het voorbeeld in ÉÉN transactie. Mails worden pas daarna verstuurd.
 * Vereist expliciete bevestiging; bij gedeelde/bestaande accounts ook bevestiging van de accountkoppelingen.
 * Mogelijke dubbele personen worden alleen verwerkt als de beheerder die regel expliciet heeft aangevinkt.
 * Herhaald uploaden maakt geen dubbele leden/passen/uitnodigingen: bestaande lidnummers worden bijgewerkt of blijven gelijk.
 */
export async function commitImport(actor: string, batchId: string, opts: { confirm?: boolean; confirmGroups?: boolean; acceptDuplicates?: number[] }) {
  if (opts.confirm !== true) throw new DomainError("confirm_required", "Bevestig de import met het vinkje.");
  const result = await db.transaction(async (tx) => {
    const [b] = await tx.select().from(schema.importBatch).where(eq(schema.importBatch.id, batchId)).for("update");
    if (!b || b.createdBy !== actor) throw new DomainError("not_found", "Import niet gevonden");
    if (b.committedAt) throw new DomainError("already_committed", "Deze import is al verwerkt");
    if (b.expiresAt < new Date() || !b.rows) throw new DomainError("expired", "De preview is verlopen. Upload het bestand opnieuw.");
    const all = b.rows as PreviewRow[];
    const accepted = new Set(opts.acceptDuplicates ?? []);
    const todo = all.filter((r) => r.status === "import" || (r.status === "review" && accepted.has(r.line)));
    const needsConfirm = todo.some((r) => r.action === "new" && r.group !== undefined);
    if (needsConfirm && !opts.confirmGroups) throw new DomainError("confirm_groups_required", "Bevestig eerst de accountkoppelingen");
    let created = 0, updated = 0;
    for (const r of todo) {
      if (r.status === "import" && r.action === "update") {
        const [m] = await tx.select().from(schema.member).where(eq(schema.member.memberNumber, r.existingNumber ?? r.memberNumber)).for("update");
        if (!m || m.deletedAt || m.archivedAt) continue; // kan sinds het voorbeeld zijn gewijzigd: overslaan
        await tx.update(schema.member).set({
          fullName: r.fullName,
          ...(r.email ? { email: r.email } : {}),
          ...(r.membershipNote ? { membershipNote: r.membershipNote } : {}),
          ...(r.externalRef ? { externalRef: r.externalRef } : {}),
          updatedAt: new Date(),
        }).where(eq(schema.member.id, m.id));
        if (r.changes?.includes("Lidmaatschap")) await applyMembershipTx(tx, actor, m.id, r);
        // Alleen veldnamen loggen, geen waarden.
        await audit({ actor, action: "member.update", targetType: "member", targetId: m.id, metadata: { via: "import", fields: r.changes ?? [] } }, tx);
        updated++;
      } else {
        const st = r.membershipStatus;
        await createMemberWithPassTx(tx, actor, {
          memberNumber: r.memberNumber,
          fullName: r.fullName,
          email: r.email || null,
          membershipNote: r.membershipNote || null,
          externalRef: r.externalRef || null,
          membership: { status: st === "suspended" ? "suspended" : "active", startDate: r.startDate || null, endDate: r.endDate || null },
          confirmLinkExisting: opts.confirmGroups,
        });
        if (st === "ended") {
          const [mm] = await tx.select().from(schema.member).where(eq(schema.member.memberNumber, r.memberNumber));
          await tx.update(schema.membership).set({ status: "ended", updatedAt: new Date() }).where(eq(schema.membership.memberId, mm.id));
        }
        created++;
      }
    }
    const counts = { created, updated, unchanged: all.filter((r) => r.status === "unchanged").length, skipped: all.length - todo.length - all.filter((r) => r.status === "unchanged").length };
    // Persoonsgegevens uit de tussenopslag wissen (ruwe tabel én voorbeeld).
    await tx.update(schema.importBatch).set({ committedAt: new Date(), rows: null, raw: null }).where(eq(schema.importBatch.id, batchId));
    await audit({ actor, action: "import.commit", targetType: "import", targetId: batchId, metadata: counts }, tx);
    return { ...counts, imported: created + updated };
  });
  await processOutbox(50).catch(() => undefined); // pas na commit mailen
  return result;
}

/** Toestand van een batch voor de importpagina; alleen voor de uploader en zolang niet verwerkt of verlopen. */
export async function getBatchState(actor: string, batchId: string): Promise<BatchState | null> {
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return null;
  const [b] = await db.select().from(schema.importBatch).where(eq(schema.importBatch.id, batchId));
  if (!b || b.createdBy !== actor || b.committedAt || b.expiresAt < new Date()) return null;
  if (b.rows && b.mapping) {
    const rows = b.rows as PreviewRow[];
    const byGroup = new Map<number, PreviewRow[]>();
    for (const r of rows) if (r.group !== undefined && r.status === "import") byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]);
    const groups: PreviewGroup[] = [...byGroup.entries()].map(([id, rs]) => ({ id, email: rs[0].email, lines: rs.map((r) => r.line), existingAccount: false, existingMembers: 0 }));
    const existing = groups.length ? await db.select({ email: schema.user.email, id: schema.user.id }).from(schema.user).where(inArray(schema.user.email, groups.map((g) => g.email))) : [];
    for (const g of groups) {
      const u = existing.find((e) => e.email === g.email);
      if (u) {
        g.existingAccount = true;
        g.existingMembers = Number((await db.execute(sql`select count(*) as c from account_member_access where user_id = ${u.id} and revoked_at is null`)).rows[0].c);
      }
    }
    return { stage: "preview", preview: { batchId, rows, groups, counts: b.counts as Preview["counts"] }, mapping: b.mapping as unknown as Mapping };
  }
  if (b.raw) {
    const { columns, unknown } = suggestMapping(b.raw[0]);
    return { stage: "mapping", batchId, headers: b.raw[0], sample: b.raw.slice(1, 4), suggested: { columns, matchKey: "memberNumber" }, unknown };
  }
  return null;
}

/** Terug naar de kolomkoppeling (voorbeeld wissen, ruwe tabel blijft tot verwerken of verlopen). */
export async function resetToMapping(actor: string, batchId: string) {
  await db.update(schema.importBatch).set({ rows: null, mapping: null }).where(and(eq(schema.importBatch.id, batchId), eq(schema.importBatch.createdBy, actor), sql`${schema.importBatch.committedAt} is null`));
}

/** Compatibel met eerdere aanroepen. */
export async function getBatchPreview(actor: string, batchId: string): Promise<Preview | null> {
  const s = await getBatchState(actor, batchId);
  return s?.stage === "preview" ? s.preview : null;
}
