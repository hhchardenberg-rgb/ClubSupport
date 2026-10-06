import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Better Auth-tabellen (identity provider: Better Auth, zie README)   */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("member"), // member | scanner | manager | sysadmin
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const authAccount = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
);

/** Rate-limit-opslag van Better Auth (inlogpogingen). */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Domein: Member, Pass, AccountMemberAccess                           */
/* ------------------------------------------------------------------ */

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberNumber: text("member_number").notNull().unique(),
    fullName: text("full_name").notNull(),
    /** Contactadres waarheen de onboarding gaat. Geen login-identiteit. */
    email: text("email"),
    /** Beheerveld; heeft bewust GEEN invloed op de geldigheid van een pas. */
    membershipNote: text("membership_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Optionele stabiele externe referentie (bijv. nummer uit een andere ledenbron); alternatieve matchsleutel bij import. */
    externalRef: text("external_ref"),
    /** Archivering: omkeerbaar, lid blijft bestaan maar is niet meer geldig/zichtbaar in de standaardlijst. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Soft delete. Permanente verwijdering volgens bewaartermijn (purge-job). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("member_name_idx").on(t.fullName),
    index("member_email_idx").on(t.email),
    uniqueIndex("member_external_ref_unique").on(t.externalRef).where(sql`${t.externalRef} is not null`),
  ],
);

/**
 * Lidmaatschap: de relatie van een persoon (lid) met de vereniging. Afzonderlijk van lid, account en pas.
 * Statussen: zie `lib/membership.ts`. Datums zijn kalenderdagen in de tijdzone Europe/Amsterdam; einddatum inclusief.
 */
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull().references(() => member.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // active | suspended | ended
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    statusNote: text("status_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("membership_member_idx").on(t.memberId),
    // Hoogstens één lopend (actief of geschorst) lidmaatschap per lid; beëindigde regels vormen de historie.
    uniqueIndex("membership_one_open").on(t.memberId).where(sql`${t.status} in ('active','suspended')`),
    check("membership_dates_ok", sql`${t.endDate} is null or ${t.startDate} is null or ${t.endDate} >= ${t.startDate}`),
    check("membership_status_ok", sql`${t.status} in ('active','suspended','ended')`),
  ],
);

export const pass = pgTable(
  "pass",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    /** HMAC-SHA256(token) hex. Uniek: een token bestaat nooit dubbel. */
    tokenHash: text("token_hash").notNull().unique(),
    /** AES-256-GCM-versleutelde token, alleen voor live passen (QR). Wordt bij intrekking gewist. */
    tokenCiphertext: text("token_ciphertext"),
    status: text("status").notNull().default("active"), // active | deactivated | revoked
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** reissued | lost | leaked | deleted | admin */
    revocationReason: text("revocation_reason"),
    statusNote: text("status_note"),
    replacedByPassId: uuid("replaced_by_pass_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("pass_member_idx").on(t.memberId),
    // Maximaal één levende pas (actief of gedeactiveerd) per lid.
    uniqueIndex("pass_one_live_per_member")
      .on(t.memberId)
      .where(sql`${t.status} in ('active','deactivated')`),
  ],
);

export const accountMemberAccess = pgTable(
  "account_member_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("access_active_unique")
      .on(t.userId, t.memberId)
      .where(sql`${t.revokedAt} is null`),
    index("access_member_idx").on(t.memberId),
  ],
);

/* ------------------------------------------------------------------ */
/* Activatie- en resettokens (alleen hash opgeslagen)                  */
/* ------------------------------------------------------------------ */

export const accountToken = pgTable(
  "account_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // activation | reset
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_token_user_idx").on(t.userId, t.purpose)],
);

/* ------------------------------------------------------------------ */
/* E-mailoutbox, audit, scans, import, eigen rate limiter              */
/* ------------------------------------------------------------------ */

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** invitation | pass_notice | password_reset */
    kind: text("kind").notNull(),
    /** Voorkomt dubbele mails: bijv. "invite:<userId>" of "pass-notice:<passId>". */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => member.id, { onDelete: "set null" }),
    /** pending | sending | sent | failed | not_sent_no_address | suppressed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    providerRef: text("provider_ref"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text("actor_user_id"), // bewust geen FK: audit overleeft accountverwijdering
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("audit_at_idx").on(t.at), index("audit_target_idx").on(t.targetType, t.targetId)],
);

export const scanEvent = pgTable(
  "scan_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    scannerUserId: text("scanner_user_id").notNull(),
    passId: uuid("pass_id"), // geen FK, geen ruwe token
    outcome: text("outcome").notNull(), // valid | inactive | revoked | unknown | rate_limited | lookup
    /** Alleen bij zoekopdrachten: aantal gevonden leden (de zoekterm zelf wordt niet bewaard). */
    resultCount: integer("result_count"),
  },
  (t) => [index("scan_at_idx").on(t.at), index("scan_scanner_idx").on(t.scannerUserId, t.at)],
);

export const importBatch = pgTable("import_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  /** Gevalideerde rijen; wordt gewist na commit of verlopen. */
  rows: jsonb("rows").$type<unknown[] | null>(),
  /** Ruwe tabel (kop + rijen) tussen upload en voorbeeld; wordt gewist zodra het voorbeeld is gemaakt of de batch verloopt. */
  raw: jsonb("raw").$type<string[][] | null>(),
  /** Kolomkoppeling en matchsleutel van het voorbeeld. */
  mapping: jsonb("mapping").$type<Record<string, unknown> | null>(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
});

export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Nieuwsbrieven                                                       */
/* ------------------------------------------------------------------ */

/**
 * Nieuwsbrief. Platte tekst met lichte opmaak (zie `server/email/newsletter-render.ts`); nooit ruwe HTML van gebruikers.
 * status: draft → sending → sent (of cancelled). Verzonden nieuwsbrieven zijn niet meer te wijzigen.
 */
export const newsletter = pgTable(
  "newsletter",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** members (geldig lidmaatschap) | former (oud-leden) | everyone (alle leden met e-mailadres, niet verwijderd) */
    audience: text("audience").notNull().default("members"),
    status: text("status").notNull().default("draft"),
    recipientCount: integer("recipient_count"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("newsletter_status_idx").on(t.status, t.createdAt)],
);

/** Eén rij per ontvangend e-mailadres (gedeelde adressen krijgen één mail). Snapshot op het moment van verzenden. */
export const newsletterDelivery = pgTable(
  "newsletter_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    newsletterId: uuid("newsletter_id").notNull().references(() => newsletter.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** pending | sending | sent | failed | suppressed | cancelled */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    providerRef: text("provider_ref"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("newsletter_delivery_unique").on(t.newsletterId, t.email), index("newsletter_delivery_due_idx").on(t.status, t.nextAttemptAt)],
);

/** Afmeldingen per e-mailadres (kleine letters). Geldt voor alle nieuwsbrieven, niet voor activatie-/resetmails. */
export const newsletterOptout = pgTable("newsletter_optout", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** link | beheer */
  source: text("source").notNull().default("link"),
});
