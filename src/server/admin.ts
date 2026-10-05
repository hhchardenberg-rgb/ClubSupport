import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

const { member, pass, user, accountMemberAccess, emailOutbox, auditEvent, scanEvent } = schema;
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

export async function listAudit(opts: { action?: string; actor?: string; page?: number }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const conds: SQL[] = [];
  if (opts.action) conds.push(ilike(auditEvent.action, `${escapeLike(opts.action.slice(0, 40))}%`));
  if (opts.actor && /^[A-Za-z0-9_-]{1,64}$/.test(opts.actor)) conds.push(eq(auditEvent.actorUserId, opts.actor));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({ id: auditEvent.id, at: auditEvent.at, action: auditEvent.action, targetType: auditEvent.targetType, targetId: auditEvent.targetId, metadata: auditEvent.metadata, actorUserId: auditEvent.actorUserId, actorName: user.name })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(where)
    .orderBy(desc(auditEvent.at))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
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

export const SCAN_OUTCOMES = ["valid", "inactive", "revoked", "unknown", "rate_limited", "lookup"] as const;

/**
 * Controlelogboek: alle scans en zoekopdrachten van controleurs. Doorzoekbaar op controleur, uitkomst, periode en
 * lid (naam/lidnummer, via de gescande pas). Bevat nooit de ruwe token of de zoekterm.
 */
export async function listScanLog(opts: { page?: number; scanner?: string; outcome?: string; from?: string; to?: string; q?: string }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const conds: SQL[] = [];
  if (opts.scanner && /^[A-Za-z0-9_-]{1,64}$/.test(opts.scanner)) conds.push(eq(scanEvent.scannerUserId, opts.scanner));
  if (opts.outcome && (SCAN_OUTCOMES as readonly string[]).includes(opts.outcome)) conds.push(eq(scanEvent.outcome, opts.outcome));
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (opts.from && day.test(opts.from)) conds.push(gte(scanEvent.at, sql`(${opts.from}::date)::timestamp at time zone 'Europe/Amsterdam'`));
  if (opts.to && day.test(opts.to)) conds.push(lt(scanEvent.at, sql`((${opts.to}::date) + 1)::timestamp at time zone 'Europe/Amsterdam'`));
  const q = opts.q?.trim().slice(0, 60);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(ilike(member.fullName, like), ilike(member.memberNumber, like))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const base = db
    .select({
      id: scanEvent.id,
      at: scanEvent.at,
      outcome: scanEvent.outcome,
      resultCount: scanEvent.resultCount,
      scannerId: scanEvent.scannerUserId,
      scannerName: user.name,
      hasPass: scanEvent.passId,
      memberName: member.fullName,
      memberNumber: member.memberNumber,
    })
    .from(scanEvent)
    .leftJoin(user, eq(user.id, scanEvent.scannerUserId))
    .leftJoin(pass, eq(pass.id, scanEvent.passId))
    .leftJoin(member, eq(member.id, pass.memberId))
    .where(where);
  const [rows, [{ n }]] = await Promise.all([
    base.orderBy(desc(scanEvent.at)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(scanEvent)
      .leftJoin(pass, eq(pass.id, scanEvent.passId))
      .leftJoin(member, eq(member.id, pass.memberId))
      .where(where),
  ]);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

/** Alle accounts die mogen controleren (scanner, ledenbeheer, systeembeheer) met het aantal registraties; ook zonder registraties. */
export async function listScanLogControllers() {
  const rows = await db.execute(sql`
    select u.id, u.name, u.role, count(e.id)::int as n
    from "user" u left join scan_event e on e.scanner_user_id = u.id
    where u.role in ('scanner','manager','sysadmin') or exists (select 1 from scan_event x where x.scanner_user_id = u.id)
    group by u.id, u.name, u.role
    order by n desc, u.name`);
  return rows.rows as { id: string; name: string; role: string; n: number }[];
}

/** Wie (staf of lid) heeft handelingen in het auditlog? Voor de keuzelijst "Door". */
export async function listAuditActors() {
  const rows = await db.execute(sql`
    select u.id, u.name, u.role, count(a.id)::int as n
    from audit_event a join "user" u on u.id = a.actor_user_id
    group by u.id, u.name, u.role order by n desc, u.name`);
  return rows.rows as { id: string; name: string; role: string; n: number }[];
}
