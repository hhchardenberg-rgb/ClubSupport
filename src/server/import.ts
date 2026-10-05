import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { parseMemberCsv, type ParsedRow } from "@/lib/csv";
import { createMemberWithPassTx, isValidEmail, normalizeEmail } from "./accounts";
import { DomainError } from "./passes";
import { processOutbox } from "./email/outbox";

export type PreviewRow = ParsedRow & { status: "import" | "error"; group?: number };
export type PreviewGroup = { id: number; email: string; lines: number[]; existingAccount: boolean; existingMembers: number };
export type Preview = { batchId: string; rows: PreviewRow[]; groups: PreviewGroup[]; counts: { total: number; import: number; error: number; groups: number } };

const BATCH_TTL_MS = 60 * 60 * 1000;

/** Valideert het bestand en slaat de gevalideerde rijen op; er wordt nog NIETS aangemaakt of gemaild. */
export async function previewImport(actor: string, text: string): Promise<Preview> {
  const parsed = parseMemberCsv(text, isValidEmail, normalizeEmail);
  const numbers = parsed.map((r) => r.memberNumber).filter(Boolean);
  const taken = numbers.length ? await db.select({ n: schema.member.memberNumber }).from(schema.member).where(inArray(schema.member.memberNumber, numbers)) : [];
  const takenSet = new Set(taken.map((t) => t.n.toLowerCase()));
  for (const r of parsed) if (r.memberNumber && takenSet.has(r.memberNumber.toLowerCase())) r.errors.push("Lidnummer bestaat al");

  // Groeperen per genormaliseerd e-mailadres (alleen rijen zonder fouten). Gedeeld adres ≠ dubbel lid.
  const byEmail = new Map<string, ParsedRow[]>();
  for (const r of parsed) if (!r.errors.length && r.email) byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r]);
  const emails = [...byEmail.keys()];
  const existing = emails.length ? await db.select().from(schema.user).where(inArray(schema.user.email, emails)) : [];
  const existingByEmail = new Map(existing.map((u) => [u.email, u]));
  for (const [email, rows] of byEmail) {
    const u = existingByEmail.get(email);
    if (u && u.role !== "member") for (const r of rows) r.errors.push("Dit e-mailadres hoort bij een staf-account");
  }

  const groups: PreviewGroup[] = [];
  const groupOf = new Map<string, number>();
  for (const [email, rows] of byEmail) {
    const ok = rows.filter((r) => !r.errors.length);
    const u = existingByEmail.get(email);
    if (ok.length > 1 || (u && ok.length)) {
      const existingMembers = u
        ? Number((await db.execute(sql`select count(*) as c from account_member_access where user_id = ${u.id} and revoked_at is null`)).rows[0].c)
        : 0;
      const id = groups.length + 1;
      groups.push({ id, email, lines: ok.map((r) => r.line), existingAccount: !!u, existingMembers });
      groupOf.set(email, id);
    }
  }
  const rows: PreviewRow[] = parsed.map((r) => ({ ...r, status: r.errors.length ? "error" : "import", group: r.email ? groupOf.get(r.email) : undefined }));
  const counts = { total: rows.length, import: rows.filter((r) => r.status === "import").length, error: rows.filter((r) => r.status === "error").length, groups: groups.length };

  const [batch] = await db
    .insert(schema.importBatch)
    .values({ createdBy: actor, expiresAt: new Date(Date.now() + BATCH_TTL_MS), rows: rows as unknown[], counts })
    .returning({ id: schema.importBatch.id });
  await audit({ actor, action: "import.preview", targetType: "import", targetId: batch.id, metadata: counts });
  return { batchId: batch.id, rows, groups, counts };
}

/**
 * Importeert de gepreviewde, foutloze rijen in ÉÉN transactie. Mails worden pas daarna verstuurd.
 * Bij groepen (gedeeld of bestaand account) is expliciete bevestiging verplicht.
 */
export async function commitImport(actor: string, batchId: string, opts: { confirmGroups: boolean }) {
  const result = await db.transaction(async (tx) => {
    const [b] = await tx.select().from(schema.importBatch).where(eq(schema.importBatch.id, batchId)).for("update");
    if (!b || b.createdBy !== actor) throw new DomainError("not_found", "Import niet gevonden");
    if (b.committedAt) throw new DomainError("already_committed", "Deze import is al verwerkt");
    if (b.expiresAt < new Date() || !b.rows) throw new DomainError("expired", "De preview is verlopen. Upload het bestand opnieuw.");
    const rows = (b.rows as PreviewRow[]).filter((r) => r.status === "import");
    const needsConfirm = rows.some((r) => r.group !== undefined);
    if (needsConfirm && !opts.confirmGroups) throw new DomainError("confirm_groups_required", "Bevestig eerst de accountkoppelingen");
    for (const r of rows) {
      await createMemberWithPassTx(tx, actor, {
        memberNumber: r.memberNumber,
        fullName: r.fullName,
        email: r.email || null,
        membershipNote: r.membershipNote || null,
        confirmLinkExisting: opts.confirmGroups,
      });
    }
    const counts = { imported: rows.length, skipped: (b.rows as PreviewRow[]).length - rows.length };
    // Persoonsgegevens uit de tussenopslag wissen.
    await tx.update(schema.importBatch).set({ committedAt: new Date(), rows: null }).where(eq(schema.importBatch.id, batchId));
    await audit({ actor, action: "import.commit", targetType: "import", targetId: batchId, metadata: counts }, tx);
    return counts;
  });
  await processOutbox(50).catch(() => undefined); // pas na commit mailen
  return result;
}
