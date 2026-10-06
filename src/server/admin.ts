import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { amsterdamToday, effectiveMembership } from "@/lib/membership";
import { membershipsFor } from "./memberships";

const { member, pass, user, accountMemberAccess, emailOutbox, auditEvent, scanEvent } = schema;
export const PAGE_SIZE = 25;

export const MEMBER_STATUS_FILTERS = ["actief", "gedeactiveerd", "zonder-pas", "gearchiveerd", "verwijderd"] as const;
export const MEMBERSHIP_FILTERS = ["valid", "scheduled", "expired", "suspended", "ended", "none", "former"] as const;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export type MemberFilters = { q?: string; status?: string; membership?: string };

/** Gedeelde filtercondities voor lijst en export. Pasfilter, lidmaatschapsfilter en archief/verwijderd zijn onafhankelijk. */
function memberConditions(opts: MemberFilters, ms: typeof membershipOpen, live: SQL | undefined) {
  const conds: SQL[] = [];
  const q = opts.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(ilike(member.fullName, like), ilike(member.memberNumber, like), ilike(member.externalRef, like))!);
  }
  const status = opts.status;
  if (status === "verwijderd") conds.push(isNotNull(member.deletedAt));
  else {
    conds.push(isNull(member.deletedAt));
    if (status === "gearchiveerd") conds.push(isNotNull(member.archivedAt));
    else conds.push(isNull(member.archivedAt)); // standaard: gearchiveerde leden niet tonen
    if (status === "actief") conds.push(eq(pass.status, "active"));
    else if (status === "gedeactiveerd") conds.push(eq(pass.status, "deactivated"));
    else if (status === "zonder-pas") conds.push(isNull(pass.id));
  }
  const today = amsterdamToday();
  const anyEnded = sql`exists (select 1 from membership e where e.member_id = ${member.id} and e.status = 'ended')`;
  switch (opts.membership) {
    case "valid": conds.push(sql`${ms.status} = 'active' and (${ms.startDate} is null or ${ms.startDate} <= ${today}) and (${ms.endDate} is null or ${ms.endDate} >= ${today})`); break;
    case "scheduled": conds.push(sql`${ms.status} = 'active' and ${ms.startDate} > ${today}`); break;
    case "expired": conds.push(sql`${ms.status} = 'active' and ${ms.endDate} < ${today}`); break;
    case "suspended": conds.push(sql`${ms.status} = 'suspended'`); break;
    case "ended": conds.push(sql`${ms.id} is null and ${anyEnded}`); break;
    case "none": conds.push(sql`${ms.id} is null and not ${anyEnded}`); break;
    // Oud-leden: lidmaatschap beëindigd, of actief maar de einddatum is verstreken
    case "former": conds.push(sql`((${ms.status} = 'active' and ${ms.endDate} < ${today}) or (${ms.id} is null and ${anyEnded}))`); break;
  }
  void live;
  return conds;
}

const membershipOpen = alias(schema.membership, "ms");
const livePass = () => and(eq(pass.memberId, member.id), inArray(pass.status, ["active", "deactivated"]));
const openJoin = () => and(eq(membershipOpen.memberId, member.id), inArray(membershipOpen.status, ["active", "suspended"]));

/** Zoeken op naam, lidnummer of externe referentie; filter op pas- en lidmaatschapsstatus; paginering. Geen e-mail in de lijst. */
export async function listMembers(opts: MemberFilters & { page?: number }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const conds = memberConditions(opts, membershipOpen, undefined);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: member.id, memberNumber: member.memberNumber, fullName: member.fullName, passStatus: pass.status, deletedAt: member.deletedAt, archivedAt: member.archivedAt,
        msStatus: membershipOpen.status, msStart: membershipOpen.startDate, msEnd: membershipOpen.endDate,
        hasEnded: sql<boolean>`exists (select 1 from membership e where e.member_id = ${member.id} and e.status = 'ended')`,
      })
      .from(member)
      .leftJoin(pass, livePass())
      .leftJoin(membershipOpen, openJoin())
      .where(where)
      .orderBy(member.fullName, member.memberNumber)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(member).leftJoin(pass, livePass()).leftJoin(membershipOpen, openJoin()).where(where),
  ]);
  const today = amsterdamToday();
  const withMembership = rows.map((r) => ({
    ...r,
    membership: effectiveMembership(r.msStatus ? [{ status: r.msStatus, startDate: r.msStart, endDate: r.msEnd }] : r.hasEnded ? [{ status: "ended", startDate: null, endDate: null }] : [], today),
  }));
  return { rows: withMembership, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

/** Alle leden voor export (met dezelfde filters als de lijst). Max. 20.000 rijen. */
export async function listMembersForExport(opts: MemberFilters) {
  const conds = memberConditions(opts, membershipOpen, undefined);
  const rows = await db
    .select({
      memberNumber: member.memberNumber, externalRef: member.externalRef, fullName: member.fullName, email: member.email, note: member.membershipNote,
      archivedAt: member.archivedAt, deletedAt: member.deletedAt, passStatus: pass.status,
      msStatus: membershipOpen.status, msStart: membershipOpen.startDate, msEnd: membershipOpen.endDate,
      hasEnded: sql<boolean>`exists (select 1 from membership e where e.member_id = ${member.id} and e.status = 'ended')`,
    })
    .from(member)
    .leftJoin(pass, livePass())
    .leftJoin(membershipOpen, openJoin())
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(member.memberNumber)
    .limit(20000);
  const today = amsterdamToday();
  return rows.map((r) => ({ ...r, membership: effectiveMembership(r.msStatus ? [{ status: r.msStatus, startDate: r.msStart, endDate: r.msEnd }] : r.hasEnded ? [{ status: "ended", startDate: null, endDate: null }] : [], today) }));
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
  // Transparantie: welke andere leden hangen aan dezelfde accounts?
  const others = accounts.length
    ? await db
        .select({ userId: accountMemberAccess.userId, memberId: member.id, fullName: member.fullName, memberNumber: member.memberNumber })
        .from(accountMemberAccess)
        .innerJoin(member, eq(member.id, accountMemberAccess.memberId))
        .where(and(inArray(accountMemberAccess.userId, accounts.map((a) => a.userId)), isNull(accountMemberAccess.revokedAt), isNull(member.deletedAt), sql`${member.id} <> ${id}`))
        .orderBy(member.fullName)
    : [];
  const emails = await db
    .select({ id: emailOutbox.id, kind: emailOutbox.kind, status: emailOutbox.status, attempts: emailOutbox.attempts, lastError: emailOutbox.lastError, createdAt: emailOutbox.createdAt, sentAt: emailOutbox.sentAt })
    .from(emailOutbox)
    .where(eq(emailOutbox.memberId, id))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(10);
  const memberships = await db.select().from(schema.membership).where(eq(schema.membership.memberId, id)).orderBy(desc(schema.membership.createdAt));
  const effective = effectiveMembership(memberships, amsterdamToday());
  // Relevante historie van dit lid (audit): acties op het lid zelf en op zijn passen. Alleen actie, tijd, actor en reden.
  const events = await db
    .select({ id: auditEvent.id, at: auditEvent.at, action: auditEvent.action, actorName: user.name, metadata: auditEvent.metadata })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(or(and(eq(auditEvent.targetType, "member"), eq(auditEvent.targetId, id)), and(eq(auditEvent.targetType, "pass"), sql`${auditEvent.metadata}->>'memberId' = ${id}`)))
    .orderBy(desc(auditEvent.at))
    .limit(30);
  return { member: m, passes, accounts, others, emails, memberships, effective, events };
}

/** Ledenaccounts (rol member) met aantal gekoppelde leden; voor de koppelingenpagina. */
export async function listMemberAccounts(opts: { q?: string; page?: number }) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const q = opts.q?.trim().slice(0, 100);
  const where = and(eq(user.role, "member"), q ? ilike(user.email, `%${escapeLike(q)}%`) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: user.id, email: user.email, activated: user.emailVerified, disabledAt: user.disabledAt,
        members: sql<number>`(select count(*)::int from account_member_access a join member m on m.id = a.member_id where a.user_id = "user"."id" and a.revoked_at is null and m.deleted_at is null)`,
      })
      .from(user)
      .where(where)
      .orderBy(user.email)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(user).where(where),
  ]);
  return { rows, total: n, page, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

export async function getMemberAccountDetail(userId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return null;
  const [u] = await db.select({ id: user.id, email: user.email, activated: user.emailVerified, disabledAt: user.disabledAt, role: user.role }).from(user).where(eq(user.id, userId));
  if (!u || u.role !== "member") return null;
  const links = await db
    .select({ memberId: member.id, fullName: member.fullName, memberNumber: member.memberNumber, grantedAt: accountMemberAccess.grantedAt, archivedAt: member.archivedAt, deletedAt: member.deletedAt })
    .from(accountMemberAccess)
    .innerJoin(member, eq(member.id, accountMemberAccess.memberId))
    .where(and(eq(accountMemberAccess.userId, userId), isNull(accountMemberAccess.revokedAt)))
    .orderBy(member.fullName);
  const ms = await membershipsFor(links.map((l) => l.memberId));
  const today = amsterdamToday();
  const passes = links.length ? await db.select({ memberId: pass.memberId, status: pass.status }).from(pass).where(and(inArray(pass.memberId, links.map((l) => l.memberId)), inArray(pass.status, ["active", "deactivated"]))) : [];
  return { account: u, links: links.map((l) => ({ ...l, membership: effectiveMembership(ms.get(l.memberId) ?? [], today), passStatus: passes.find((p) => p.memberId === l.memberId)?.status ?? null })) };
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
      (select count(*) from member m where m.deleted_at is null and exists (select 1 from membership e where e.member_id = m.id and e.status = 'ended') and not exists (select 1 from membership o where o.member_id = m.id and o.status in ('active','suspended')))::int as former_ended,
      (select count(*) from member m join membership o on o.member_id = m.id where m.deleted_at is null and o.status = 'active' and o.end_date < ${amsterdamToday()})::int as former_expired,
      (select count(*) from pass where status = 'active')::int as active,
      (select count(*) from pass where status = 'deactivated')::int as deactivated,
      (select count(*) from email_outbox where status in ('failed','not_sent_no_address'))::int as mail_problems,
      (select count(*) from scan_event where at > now() - interval '24 hours')::int as scans_24h`)).rows as Record<string, number>[];
  return r;
}

export const SCAN_OUTCOMES = ["valid", "inactive", "membership_invalid", "revoked", "unknown", "rate_limited", "lookup"] as const;

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
