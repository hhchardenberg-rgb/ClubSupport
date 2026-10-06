import { createHmac } from "node:crypto";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { amsterdamToday } from "@/lib/membership";
import { amsterdamLocalToDate } from "@/lib/time";
import { rateLimit } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/tokens";
import { newsletterMail, validateNewsletter } from "./email/newsletter-render";
import { sendMail } from "./email/provider";
import { DomainError } from "./passes";

const { newsletter, newsletterDelivery, newsletterOptout } = schema;

export const AUDIENCES = ["members", "former", "everyone"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = { members: "Leden (geldig lidmaatschap)", former: "Oud-leden", everyone: "Iedereen met een e-mailadres" };
export const AUDIENCE_HELP: Record<Audience, string> = {
  members: "Leden met een nu geldig lidmaatschap (niet gearchiveerd). Geschorste en nog niet gestarte leden ontvangen dit niet.",
  former: "Oud-leden: lidmaatschap beëindigd of verlopen (ook gearchiveerde oud-leden).",
  everyone: "Alle niet-verwijderde leden en oud-leden met een e-mailadres, ongeacht lidmaatschapsstatus.",
};
const AUDIENCE_NOTE: Record<Audience, string> = {
  members: "Je ontvangt deze nieuwsbrief omdat je lid bent van HHC ClubSupport.",
  former: "Je ontvangt deze nieuwsbrief omdat je eerder lid was van HHC ClubSupport.",
  everyone: "Je ontvangt deze nieuwsbrief omdat je lid of oud-lid bent van HHC ClubSupport.",
};

export const MAX_ATTEMPTS = 5;
/** In testmodus worden hoogstens zoveel mails echt verstuurd (alles gaat dan naar één testadres); de rest wordt overgeslagen. */
export const TEST_MODE_CAP = 3;

/* ------------------------------ ontvangers ------------------------------ */

/**
 * Unieke ontvangende adressen (kleine letters) voor een doelgroep, zonder afgemelde adressen. Gedeelde adressen (gezin)
 * tellen één keer. Alleen het contactadres van het lid wordt gebruikt; nooit zomaar een account-e-mailadres.
 */
export async function audienceRecipients(audience: Audience): Promise<{ emails: string[]; optedOut: number }> {
  const today = amsterdamToday();
  const lidmaatschap =
    audience === "members"
      ? sql`m.archived_at is null and ms.status = 'active' and (ms.start_date is null or ms.start_date <= ${today}) and (ms.end_date is null or ms.end_date >= ${today})`
      : audience === "former"
        ? sql`((ms.status = 'active' and ms.end_date < ${today}) or (ms.id is null and exists (select 1 from membership e where e.member_id = m.id and e.status = 'ended')))`
        : sql`true`;
  const rows = (await db.execute(sql`
    select distinct lower(btrim(m.email)) as email,
      exists (select 1 from newsletter_optout o where o.email = lower(btrim(m.email))) as opted_out
    from member m
    left join membership ms on ms.member_id = m.id and ms.status in ('active','suspended')
    where m.deleted_at is null and m.email is not null and btrim(m.email) <> '' and ${lidmaatschap}`)).rows as { email: string; opted_out: boolean }[];
  return { emails: rows.filter((r) => !r.opted_out).map((r) => r.email).sort(), optedOut: rows.filter((r) => r.opted_out).length };
}

/* ------------------------------ afmeldtoken ------------------------------ */

const sig = (deliveryId: string) => createHmac("sha256", env.tokenHmacKey).update(`newsletter-unsubscribe:${deliveryId}`).digest("base64url").slice(0, 32);
/** Afmeldtoken = verzendregel-id + HMAC. Er wordt geen token opgeslagen; verifiëren kan zonder database-geheim in de link. */
export const unsubscribeToken = (deliveryId: string) => `${deliveryId}.${sig(deliveryId)}`;
export function parseUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 100) return null;
  const [id, s, extra] = token.split(".");
  if (!id || !s || extra !== undefined || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeEqual(s, sig(id)) ? id : null;
}

/* ------------------------------ beheer: concepten ------------------------------ */

type Input = { subject: string; body: string; audience: string };
function clean(input: Input) {
  const subject = input.subject.trim();
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  const err = validateNewsletter(subject, body);
  if (err) throw new DomainError("invalid", err);
  if (!(AUDIENCES as readonly string[]).includes(input.audience)) throw new DomainError("invalid", "Kies een doelgroep.");
  return { subject, body, audience: input.audience as Audience };
}

export async function createNewsletter(actor: string, input: Input) {
  const v = clean(input);
  const [n] = await db.insert(newsletter).values({ ...v, createdBy: actor }).returning({ id: newsletter.id });
  await audit({ actor, action: "newsletter.create", targetType: "newsletter", targetId: n.id, metadata: { audience: v.audience } });
  return n.id;
}

export async function updateNewsletter(actor: string, id: string, input: Input) {
  const v = clean(input);
  const r = await db.update(newsletter).set({ ...v, updatedAt: new Date() }).where(and(eq(newsletter.id, id), eq(newsletter.status, "draft"))).returning({ id: newsletter.id });
  if (!r.length) throw new DomainError("not_draft", "Alleen een concept kan worden gewijzigd.");
  await audit({ actor, action: "newsletter.update", targetType: "newsletter", targetId: id, metadata: { audience: v.audience } });
}

export async function deleteNewsletterDraft(actor: string, id: string) {
  const r = await db.delete(newsletter).where(and(eq(newsletter.id, id), eq(newsletter.status, "draft"))).returning({ id: newsletter.id });
  if (!r.length) throw new DomainError("not_draft", "Alleen een concept kan worden verwijderd.");
  await audit({ actor, action: "newsletter.delete", targetType: "newsletter", targetId: id });
}

export async function listNewsletters() {
  return db.select().from(newsletter).orderBy(desc(newsletter.createdAt)).limit(100);
}

const UUID = /^[0-9a-f-]{36}$/i;
export async function getNewsletter(id: string) {
  if (!UUID.test(id)) return null;
  const [n] = await db.select().from(newsletter).where(eq(newsletter.id, id));
  return n ?? null;
}

export async function newsletterStats(id: string) {
  const rows = await db.select({ status: newsletterDelivery.status, n: sql<number>`count(*)::int` }).from(newsletterDelivery).where(eq(newsletterDelivery.newsletterId, id)).groupBy(newsletterDelivery.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return { total, pending: (by.pending ?? 0) + (by.sending ?? 0), sent: by.sent ?? 0, failed: by.failed ?? 0, suppressed: by.suppressed ?? 0, cancelled: by.cancelled ?? 0 };
}

export async function countOptouts() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(newsletterOptout);
  return n;
}

/* ------------------------------ testmail en verzenden ------------------------------ */

/** Testmail van het concept naar het eigen account van de beheerder. Geen afmeldregel, wel dezelfde opmaak. */
export async function sendTestNewsletter(actor: string, id: string, toEmail: string) {
  if (!(await rateLimit(`newsletter-test:${actor}`, 10, 3600))) throw new DomainError("rate_limited", "Te veel testmails. Probeer het later opnieuw.");
  const n = await getNewsletter(id);
  if (!n) throw new DomainError("not_found", "Nieuwsbrief niet gevonden");
  const mail = newsletterMail({ subject: `[Testmail] ${n.subject}`, body: n.body, token: "voorbeeld", audienceNote: AUDIENCE_NOTE[n.audience as Audience] ?? AUDIENCE_NOTE.everyone, preview: true });
  const res = await sendMail(toEmail, mail, `nl-test:${id}:${Date.now()}`);
  await audit({ actor, action: "newsletter.test", targetType: "newsletter", targetId: id });
  if (res.ok === "suppressed") return { sent: false as const, note: "E-mail staat uit (EMAIL_MODE=disabled); er is niets verstuurd." };
  if (res.ok !== true) throw new DomainError("send_failed", "De testmail kon niet worden verstuurd. Controleer de e-mailinstellingen.");
  return { sent: true as const, note: env.emailMode === "test" ? "Testmodus: de mail is naar het testadres gestuurd." : "Testmail verstuurd." };
}

/**
 * Zet een concept in de wachtrij. Atomair: draft → sending, ontvangers worden vastgelegd (één regel per adres) en het aantal
 * moet overeenkomen met wat de beheerder zag. Verzenden gebeurt daarna in batches (processNewsletters).
 * In testmodus worden maximaal TEST_MODE_CAP mails echt verstuurd.
 */
export async function queueNewsletter(actor: string, id: string, opts: { confirm: boolean; expectedCount: number | null; fromScheduled?: boolean }) {
  if (!opts.confirm) throw new DomainError("confirm_required", "Bevestig het versturen met het vinkje.");
  const out = await db.transaction(async (tx) => {
    const [n] = await tx.select().from(newsletter).where(eq(newsletter.id, id)).for("update");
    if (!n) throw new DomainError("not_found", "Nieuwsbrief niet gevonden");
    if (n.status !== (opts.fromScheduled ? "scheduled" : "draft")) throw new DomainError("not_draft", "Deze nieuwsbrief is al verstuurd of wordt verstuurd.");
    const { emails } = await audienceRecipients(n.audience as Audience);
    if (emails.length === 0) throw new DomainError("no_recipients", "Deze doelgroep heeft geen ontvangers.");
    if (opts.expectedCount !== null && emails.length !== opts.expectedCount) throw new DomainError("count_changed", `Het aantal ontvangers is gewijzigd (nu ${emails.length}). Controleer het overzicht en bevestig opnieuw.`);
    const live = env.emailMode === "live";
    await tx.insert(newsletterDelivery).values(
      emails.map((email, i) => ({ newsletterId: id, email, status: live || i < TEST_MODE_CAP ? "pending" : "suppressed", lastError: live || i < TEST_MODE_CAP ? null : "Testmodus: niet verzonden" })),
    ).onConflictDoNothing();
    await tx.update(newsletter).set({ status: "sending", recipientCount: emails.length, ...(opts.fromScheduled ? {} : { sentBy: actor }), sentAt: new Date(), scheduleError: null, updatedAt: new Date() }).where(eq(newsletter.id, id));
    await audit({ actor, action: opts.fromScheduled ? "newsletter.send_scheduled" : "newsletter.send", targetType: "newsletter", targetId: id, metadata: { recipients: emails.length, audience: n.audience, mode: env.emailMode } }, tx);
    return { recipients: emails.length };
  });
  return out;
}

/**
 * Verwerkt wachtende verzendregels van nieuwsbrieven in verzending (batchgrootte `limit`). Idempotent: een regel wordt
 * atomair geclaimd (pending → sending). Afgemelde adressen worden bij verzenden nogmaals overgeslagen. Begrensde retries met backoff.
 * Zodra niets meer wacht, wordt de nieuwsbrief 'sent'.
 */
export async function processNewsletters(limit = 40, onlyId?: string): Promise<{ sent: number; failed: number; remaining: number }> {
  let sent = 0;
  let failed = 0;
  const due = await db
    .select({ id: newsletterDelivery.id })
    .from(newsletterDelivery)
    .innerJoin(newsletter, eq(newsletter.id, newsletterDelivery.newsletterId))
    .where(and(eq(newsletter.status, "sending"), eq(newsletterDelivery.status, "pending"), lte(newsletterDelivery.nextAttemptAt, new Date()), onlyId ? eq(newsletter.id, onlyId) : undefined))
    .limit(limit);

  const one = async (id: string) => {
    const [row] = await db.update(newsletterDelivery).set({ status: "sending", attempts: sql`${newsletterDelivery.attempts} + 1` }).where(and(eq(newsletterDelivery.id, id), eq(newsletterDelivery.status, "pending"))).returning();
    if (!row) return;
    const [n] = await db.select().from(newsletter).where(eq(newsletter.id, row.newsletterId));
    const [opt] = await db.select().from(newsletterOptout).where(eq(newsletterOptout.email, row.email));
    if (!n || n.status !== "sending" || opt) {
      await db.update(newsletterDelivery).set({ status: opt ? "suppressed" : "cancelled", lastError: opt ? "Afgemeld" : "Geannuleerd" }).where(eq(newsletterDelivery.id, id));
      return;
    }
    const mail = newsletterMail({ subject: n.subject, body: n.body, token: unsubscribeToken(row.id), audienceNote: AUDIENCE_NOTE[n.audience as Audience] ?? AUDIENCE_NOTE.everyone });
    const res = await sendMail(row.email, mail, `nl:${row.id}:${row.attempts}`);
    if (res.ok === true) {
      await db.update(newsletterDelivery).set({ status: "sent", sentAt: new Date(), providerRef: res.ref, lastError: null }).where(eq(newsletterDelivery.id, id));
      sent++;
    } else if (res.ok === "suppressed") {
      await db.update(newsletterDelivery).set({ status: "suppressed", lastError: "E-mail uitgeschakeld (EMAIL_MODE=disabled)" }).where(eq(newsletterDelivery.id, id));
    } else {
      const final = res.permanent || row.attempts >= MAX_ATTEMPTS;
      await db.update(newsletterDelivery).set({ status: final ? "failed" : "pending", lastError: res.error, nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60_000) }).where(eq(newsletterDelivery.id, id));
      if (final) failed++;
    }
  };
  for (let i = 0; i < due.length; i += 5) await Promise.all(due.slice(i, i + 5).map((d) => one(d.id)));

  // Klaar? Dan 'sent'. (Alleen wanneer er niets meer in behandeling of wachtend is.)
  await db.execute(sql`
    update newsletter n set status = 'sent', updated_at = now()
    where n.status = 'sending' and not exists (select 1 from newsletter_delivery d where d.newsletter_id = n.id and d.status in ('pending','sending'))`);
  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(newsletterDelivery)
    .innerJoin(newsletter, eq(newsletter.id, newsletterDelivery.newsletterId))
    .where(and(eq(newsletter.status, "sending"), inArray(newsletterDelivery.status, ["pending", "sending"]), onlyId ? eq(newsletter.id, onlyId) : undefined));
  return { sent, failed, remaining };
}

/** Annuleren tijdens verzending: wat nog wacht wordt niet meer verstuurd; wat al is verzonden blijft zo. */
export async function cancelNewsletter(actor: string, id: string) {
  await db.transaction(async (tx) => {
    const [n] = await tx.select().from(newsletter).where(eq(newsletter.id, id)).for("update");
    if (!n || n.status !== "sending") throw new DomainError("not_sending", "Alleen een nieuwsbrief in verzending kan worden geannuleerd.");
    await tx.update(newsletterDelivery).set({ status: "cancelled", lastError: "Geannuleerd" }).where(and(eq(newsletterDelivery.newsletterId, id), eq(newsletterDelivery.status, "pending")));
    await tx.update(newsletter).set({ status: "cancelled", updatedAt: new Date() }).where(eq(newsletter.id, id));
    await audit({ actor, action: "newsletter.cancel", targetType: "newsletter", targetId: id }, tx);
  });
}

export async function retryFailedDeliveries(actor: string, id: string) {
  const r = await db.update(newsletterDelivery).set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null }).where(and(eq(newsletterDelivery.newsletterId, id), eq(newsletterDelivery.status, "failed"))).returning({ id: newsletterDelivery.id });
  if (r.length) {
    await db.update(newsletter).set({ status: "sending" }).where(and(eq(newsletter.id, id), eq(newsletter.status, "sent")));
    await audit({ actor, action: "newsletter.retry", targetType: "newsletter", targetId: id, metadata: { count: r.length } });
  }
  return r.length;
}

/* ------------------------------ afmelden ------------------------------ */

const mask = (email: string) => {
  const [l, d] = email.split("@");
  return `${l.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, l.length - 1)))}@${d}`;
};

/** Voor de afmeldpagina: geldig token? Toont alleen een gemaskeerd adres. Muteert niets (veilig tegen link-prefetching). */
export async function describeUnsubscribe(token: unknown) {
  const id = parseUnsubscribeToken(token);
  if (!id) return null;
  const [d] = await db.select({ email: newsletterDelivery.email }).from(newsletterDelivery).where(eq(newsletterDelivery.id, id));
  if (!d) return null;
  const [o] = await db.select().from(newsletterOptout).where(eq(newsletterOptout.email, d.email));
  return { masked: mask(d.email), alreadyUnsubscribed: !!o };
}

/** Meldt het adres af voor alle nieuwsbrieven. Idempotent. Wachtende verzendregels voor dit adres worden overgeslagen. */
export async function unsubscribeByToken(token: unknown): Promise<boolean> {
  const id = parseUnsubscribeToken(token);
  if (!id) return false;
  const [d] = await db.select({ email: newsletterDelivery.email }).from(newsletterDelivery).where(eq(newsletterDelivery.id, id));
  if (!d) return false;
  await db.transaction(async (tx) => {
    await tx.insert(newsletterOptout).values({ email: d.email, source: "link" }).onConflictDoNothing();
    await tx.update(newsletterDelivery).set({ status: "suppressed", lastError: "Afgemeld" }).where(and(eq(newsletterDelivery.email, d.email), eq(newsletterDelivery.status, "pending")));
    await audit({ actor: null, action: "newsletter.unsubscribe", targetType: "newsletter_delivery", targetId: id }, tx); // geen e-mailadres in het audit-spoor
  });
  return true;
}

/* ------------------------------ plannen ------------------------------ */

export const SCHEDULE_MIN_MINUTES = 10;

/**
 * Plan een concept voor later (tijd in Europe/Amsterdam). De ontvangers worden pas op het verzendmoment bepaald (afmeldingen,
 * lidmaatschapswijzigingen tot dan toe tellen mee). Het moet minimaal 10 minuten en hooguit een jaar vooruit liggen.
 * Een geplande nieuwsbrief is niet te wijzigen: annuleer eerst de planning.
 */
export async function scheduleNewsletter(actor: string, id: string, localTime: string, confirm: boolean, now = new Date()) {
  if (!confirm) throw new DomainError("confirm_required", "Bevestig het plannen met het vinkje.");
  const at = amsterdamLocalToDate(localTime);
  if (!at) throw new DomainError("invalid_time", "Vul een geldige datum en tijd in.");
  if (at.getTime() < now.getTime() + SCHEDULE_MIN_MINUTES * 60_000) throw new DomainError("too_soon", `Plan minimaal ${SCHEDULE_MIN_MINUTES} minuten vooruit.`);
  if (at.getTime() > now.getTime() + 366 * 86_400_000) throw new DomainError("too_far", "Plan hooguit een jaar vooruit.");
  await db.transaction(async (tx) => {
    const [n] = await tx.select().from(newsletter).where(eq(newsletter.id, id)).for("update");
    if (!n) throw new DomainError("not_found", "Nieuwsbrief niet gevonden");
    if (n.status !== "draft") throw new DomainError("not_draft", "Alleen een concept kan worden gepland.");
    const { emails } = await audienceRecipients(n.audience as Audience);
    if (!emails.length) throw new DomainError("no_recipients", "Deze doelgroep heeft nu geen ontvangers.");
    await tx.update(newsletter).set({ status: "scheduled", scheduledAt: at, scheduleError: null, sentBy: actor, updatedAt: new Date() }).where(eq(newsletter.id, id));
    await audit({ actor, action: "newsletter.schedule", targetType: "newsletter", targetId: id, metadata: { at: at.toISOString(), audience: n.audience } }, tx);
  });
  return at;
}

export async function unscheduleNewsletter(actor: string, id: string) {
  const r = await db.update(newsletter).set({ status: "draft", scheduledAt: null, updatedAt: new Date() }).where(and(eq(newsletter.id, id), eq(newsletter.status, "scheduled"))).returning({ id: newsletter.id });
  if (!r.length) throw new DomainError("not_scheduled", "Deze nieuwsbrief is niet (meer) gepland.");
  await audit({ actor, action: "newsletter.unschedule", targetType: "newsletter", targetId: id });
}

/**
 * Zet nieuwsbrieven waarvan het moment is aangebroken in verzending (voor de rest geldt het gewone batchproces). Wordt aangeroepen
 * door de dagelijkse cron én zodra een beheerder de nieuwsbriefpagina's opent; elke nieuwsbrief wordt hoogstens één keer gestart.
 * Heeft de doelgroep op dat moment geen ontvangers, dan wordt het weer een concept met een foutmelding.
 */
export async function dispatchDueNewsletters(now = new Date()): Promise<number> {
  const due = await db.select({ id: newsletter.id, by: newsletter.sentBy }).from(newsletter).where(and(eq(newsletter.status, "scheduled"), lte(newsletter.scheduledAt, now)));
  let started = 0;
  for (const n of due) {
    try {
      await queueNewsletter(n.by ?? "systeem", n.id, { confirm: true, expectedCount: null, fromScheduled: true });
      started++;
    } catch (e) {
      if (e instanceof DomainError && e.code === "not_draft") continue; // al door een andere aanroep gestart
      const msg = e instanceof DomainError ? e.message : "Verzenden niet gelukt";
      await db.update(newsletter).set({ status: "draft", scheduledAt: null, scheduleError: msg, updatedAt: new Date() }).where(and(eq(newsletter.id, n.id), eq(newsletter.status, "scheduled")));
      await audit({ actor: n.by, action: "newsletter.schedule_failed", targetType: "newsletter", targetId: n.id, metadata: { reason: msg } });
    }
  }
  return started;
}
