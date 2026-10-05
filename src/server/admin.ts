import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

const { member, pass, user, accountMemberAccess, emailOutbox, auditEvent } = schema;
export const PAGE_SIZE = 25;

export const MEMBER_STATUS_FILTERS = ["actief", "gedeactiveerd", "zonder-pas", "verwijderd"] as const;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

/** Zoeken op naam of lidnummer, filter op passtatus, met paginering. Geen e-mail in de lijst. */
export async function listMembers(opts: { q?: string; status?: string; page?: number }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const conds: SQL[] = [];
  const q = opts.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(ilike(member.fullName, like), ilike(member.memberNumber, like))!);
  }
  const status = opts.status;
  if (status === "verwijderd") conds.push(isNotNull(member.deletedAt));
  else {
    conds.push(isNull(member.deletedAt));
    if (status === "actief") conds.push(eq(pass.status, "active"));
    else if (status === "gedeactiveerd") conds.push(eq(pass.status, "deactivated"));
    else if (status === "zonder-pas") conds.push(isNull(pass.id));
  }
  const live = and(eq(pass.memberId, member.id), inArray(pass.status, ["active", "deactivated"]));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: member.id, memberNumber: member.memberNumber, fullName: member.fullName, passStatus: pass.status, deletedAt: member.deletedAt })
      .from(member)
      .leftJoin(pass, live)
      .where(where)
      .orderBy(member.fullName, member.memberNumber)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(member).leftJoin(pass, live).where(where),
  ]);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

export async function getMemberDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [m] = await db.select().from(member).where(eq(member.id, id));
  if (!m) return null;
  const passes = await db
    .select({ id: pass.id, status: pass.status, issuedAt: pass.issuedAt, deactivatedAt: pass.deactivatedAt, revokedAt: pass.revokedAt, revocationReason: pass.revocationReason, statusNote: pass.statusNote })
    .from(pass)
    .where(eq(pass.memberId, id))
    .orderBy(desc(pass.issuedAt));
  const accounts = await db
    .select({ userId: user.id, email: user.email, activated: user.emailVerified, grantedAt: accountMemberAccess.grantedAt })
    .from(accountMemberAccess)
    .innerJoin(user, eq(user.id, accountMemberAccess.userId))
    .where(and(eq(accountMemberAccess.memberId, id), isNull(accountMemberAccess.revokedAt)));
  const emails = await db
    .select({ id: emailOutbox.id, kind: emailOutbox.kind, status: emailOutbox.status, attempts: emailOutbox.attempts, lastError: emailOutbox.lastError, createdAt: emailOutbox.createdAt, sentAt: emailOutbox.sentAt })
    .from(emailOutbox)
    .where(eq(emailOutbox.memberId, id))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(10);
  return { member: m, passes, accounts, emails };
}

export async function listStaff() {
  return db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, activated: user.emailVerified, mfa: user.twoFactorEnabled, disabledAt: user.disabledAt })
    .from(user)
    .where(inArray(user.role, ["scanner", "manager", "sysadmin"]))
    .orderBy(user.role, user.name);
}

export async function listAudit(opts: { action?: string; page?: number }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const where = opts.action ? ilike(auditEvent.action, `${escapeLike(opts.action.slice(0, 40))}%`) : undefined;
  const rows = await db.select().from(auditEvent).where(where).orderBy(desc(auditEvent.at)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(auditEvent).where(where);
  return { rows, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)), total: n };
}

export async function dashboardCounts() {
  const [r] = (await db.execute(sql`
    select
      (select count(*) from member where deleted_at is null)::int as members,
      (select count(*) from pass where status = 'active')::int as active,
      (select count(*) from pass where status = 'deactivated')::int as deactivated,
      (select count(*) from email_outbox where status in ('failed','not_sent_no_address'))::int as mail_problems,
      (select count(*) from scan_event where at > now() - interval '24 hours')::int as scans_24h`)).rows as Record<string, number>[];
  return r;
}
