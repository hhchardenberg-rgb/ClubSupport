import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { isStaff } from "@/lib/permissions";
import { DomainError, issuePassTx } from "./passes";

const { member, user, accountMemberAccess, emailOutbox, pass } = schema;

/**
 * E-mailnormalisatie volgens de identity provider (Better Auth): trim + lowercase.
 * Geen verwijdering van plus-tags of punten, geen aliassen samenvoegen.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function isValidEmail(raw: string | null | undefined): boolean {
  return !!raw && raw.length <= 254 && EMAIL_RE.test(normalizeEmail(raw));
}

/** Staf mag bij handmatige invoer zien welke leden al onder dit adres vallen (voor bevestiging). */
export async function previewAccountForEmail(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) return { exists: false as const, members: [] as { memberNumber: string; fullName: string }[] };
  const rows = await db
    .select({ memberNumber: member.memberNumber, fullName: member.fullName })
    .from(accountMemberAccess)
    .innerJoin(member, eq(member.id, accountMemberAccess.memberId))
    .where(and(eq(accountMemberAccess.userId, u.id), isNull(accountMemberAccess.revokedAt), isNull(member.deletedAt)));
  return { exists: true as const, isMemberAccount: !isStaff(u.role), members: rows };
}

export type CreateMemberInput = {
  memberNumber: string;
  fullName: string;
  email: string | null;
  membershipNote?: string | null;
  /** Beheerder bevestigt expliciet dat dit lid aan een bestaand account wordt gekoppeld. */
  confirmLinkExisting?: boolean;
};

/**
 * Maakt lid + pas + accounttoegang aan en zet de onboardingmail klaar (outbox), alles in één transactie.
 * Er wordt pas gemaild nadat de transactie is gecommit (zie processOutbox).
 */
export async function createMemberWithPassTx(tx: Tx, actor: string, input: CreateMemberInput) {
  const email = input.email && input.email.trim() ? normalizeEmail(input.email) : null;
  if (email && !isValidEmail(email)) throw new DomainError("invalid_email", "Ongeldig e-mailadres");

  const [m] = await tx
    .insert(member)
    .values({
      memberNumber: input.memberNumber.trim(),
      fullName: input.fullName.trim(),
      email,
      membershipNote: input.membershipNote ?? null,
      createdBy: actor,
    })
    .returning();
  const { passId } = await issuePassTx(tx, m.id, actor);
  await audit({ actor, action: "member.create", targetType: "member", targetId: m.id, metadata: { passId } }, tx);

  if (!email) {
    await tx.insert(emailOutbox).values({
      kind: "invitation",
      idempotencyKey: `invite-noaddr:${m.id}`,
      memberId: m.id,
      status: "not_sent_no_address",
    });
    return { memberId: m.id, passId, account: "none" as const };
  }

  const [existing] = await tx.select().from(user).where(eq(user.email, email)).for("update");
  let userId: string;
  let mailKind: "invitation" | "pass_notice" | null;
  let account: "created" | "linked";

  if (!existing) {
    userId = randomUUID();
    await tx.insert(user).values({ id: userId, name: input.fullName.trim(), email, role: "member", emailVerified: false });
    await audit({ actor, action: "account.create", targetType: "user", targetId: userId, metadata: { role: "member" } }, tx);
    mailKind = "invitation";
    account = "created";
  } else {
    if (isStaff(existing.role)) throw new DomainError("staff_email", "Dit e-mailadres hoort bij een staf-account en kan niet voor een lid worden gebruikt");
    if (!input.confirmLinkExisting) throw new DomainError("confirm_link_required", "Dit e-mailadres hoort al bij een account. Bevestig de koppeling.");
    userId = existing.id;
    // Nog niet geactiveerd account (staat al een uitnodiging open)? Dan volstaat die; anders een pasmelding.
    mailKind = existing.emailVerified ? "pass_notice" : null;
    account = "linked";
  }

  await tx.insert(accountMemberAccess).values({ userId, memberId: m.id, grantedBy: actor });
  await audit({ actor, action: "access.grant", targetType: "member", targetId: m.id, metadata: { userId } }, tx);

  if (mailKind === "invitation") {
    // Hoogstens één uitnodiging per nieuw account: sleutel is per account.
    await tx.insert(emailOutbox).values({ kind: "invitation", idempotencyKey: `invite:${userId}`, userId, memberId: m.id }).onConflictDoNothing();
  } else if (mailKind === "pass_notice") {
    await tx.insert(emailOutbox).values({ kind: "pass_notice", idempotencyKey: `pass-notice:${passId}`, userId, memberId: m.id }).onConflictDoNothing();
  }
  return { memberId: m.id, passId, account, userId };
}

export async function createMemberWithPass(actor: string, input: CreateMemberInput) {
  return db.transaction((tx) => createMemberWithPassTx(tx, actor, input));
}

/** Alleen een beheerder koppelt/ontkoppelt; beide acties worden geaudit. */
export async function linkMemberToAccount(actor: string, memberId: string, userId: string) {
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(user).where(eq(user.id, userId));
    if (!u || isStaff(u.role)) throw new DomainError("invalid_account", "Ongeldig account");
    await tx.insert(accountMemberAccess).values({ userId, memberId, grantedBy: actor }).onConflictDoNothing();
    await audit({ actor, action: "access.grant", targetType: "member", targetId: memberId, metadata: { userId } }, tx);
  });
}

export async function unlinkMemberFromAccount(actor: string, memberId: string, userId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(accountMemberAccess)
      .set({ revokedAt: new Date(), revokedBy: actor })
      .where(and(eq(accountMemberAccess.userId, userId), eq(accountMemberAccess.memberId, memberId), isNull(accountMemberAccess.revokedAt)));
    await audit({ actor, action: "access.revoke", targetType: "member", targetId: memberId, metadata: { userId } }, tx);
  });
}

/** Passen die expliciet aan dit account zijn gekoppeld — de enige toegangsroute voor leden (IDOR-veilig). */
export async function listPassesForAccount(userId: string) {
  return db
    .select({
      passId: pass.id,
      status: pass.status,
      tokenCiphertext: pass.tokenCiphertext,
      memberId: member.id,
      fullName: member.fullName,
      memberNumber: member.memberNumber,
    })
    .from(accountMemberAccess)
    .innerJoin(member, eq(member.id, accountMemberAccess.memberId))
    .innerJoin(pass, and(eq(pass.memberId, member.id), sql`${pass.status} in ('active','deactivated')`))
    .where(and(eq(accountMemberAccess.userId, userId), isNull(accountMemberAccess.revokedAt), isNull(member.deletedAt)))
    .orderBy(member.fullName);
}

/** Eén pas voor een account; null als het account er geen expliciete toegang toe heeft. */
export async function getPassForAccount(userId: string, passId: string) {
  return (await listPassesForAccount(userId)).find((p) => p.passId === passId) ?? null;
}
