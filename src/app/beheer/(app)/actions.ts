"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { CSV_MAX_BYTES } from "@/lib/csv";
import { rateLimit } from "@/lib/ratelimit";
import { ROLES, type Role } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { createMemberWithPass, isValidEmail, linkMemberToAccount, normalizeEmail, previewAccountForEmail, unlinkMemberFromAccount } from "@/server/accounts";
import { processOutbox, resendInvitation } from "@/server/email/outbox";
import { commitImport, previewMapped, resetToMapping, startImport, type MatchKey } from "@/server/import";
import { archiveMember, changeMembership, cleanDates, unarchiveMember, type MembershipAction } from "@/server/memberships";
import { FIELD_KEYS, type FieldKey } from "@/lib/csv";
import { DomainError, deactivatePass, deleteMember, reactivatePass, reissuePass, revokePass } from "@/server/passes";

export type FormState = { error?: string; needsConfirm?: { email: string; members: { memberNumber: string; fullName: string }[]; isNewAccount: boolean } } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function flow(back: string, fn: () => Promise<string>): Promise<never> {
  let q = "";
  try {
    q = `msg=${encodeURIComponent(await fn())}`;
  } catch (e) {
    if (!(e instanceof DomainError)) console.error("beheer-actie mislukt", e instanceof Error ? e.message : "onbekend");
    q = `err=${encodeURIComponent(e instanceof DomainError ? e.message : "Er ging iets mis. Probeer het opnieuw.")}`;
  }
  revalidatePath("/beheer", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${q}`);
}

/* ------------------------------ leden ------------------------------ */

export async function createMemberAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireStaff("beheer", "members.write");
  await requireStaff("beheer", "passes.manage");
  const input = { memberNumber: str(f, "memberNumber"), fullName: str(f, "fullName"), email: str(f, "email") || null, membershipNote: str(f, "membershipNote") || null, externalRef: str(f, "externalRef") || null };
  if (input.externalRef && !/^[A-Za-z0-9._\-/:]{1,64}$/.test(input.externalRef)) return { error: "Externe referentie mag alleen letters, cijfers en . _ - / : bevatten (max 64)." };
  const msStatus = str(f, "msStatus") === "suspended" ? "suspended" : "active";
  try {
    cleanDates(str(f, "msStart"), str(f, "msEnd"));
  } catch (e) {
    return { error: e instanceof DomainError ? e.message : "Ongeldige datum." };
  }
  if (!input.memberNumber || !/^[A-Za-z0-9._\-/]{1,32}$/.test(input.memberNumber)) return { error: "Lidnummer is verplicht (letters, cijfers en . _ - /, max 32)." };
  if (!input.fullName || input.fullName.length > 120) return { error: "Naam is verplicht (max 120 tekens)." };
  if (input.email && !isValidEmail(input.email)) return { error: "Ongeldig e-mailadres." };
  const confirm = f.get("confirmLink") === "on";

  if (input.email) {
    const prev = await previewAccountForEmail(input.email);
    if (prev.exists && !("isMemberAccount" in prev && prev.isMemberAccount)) return { error: "Dit e-mailadres hoort bij een staf-account en kan niet voor een lid worden gebruikt." };
    if (prev.exists && !confirm) return { needsConfirm: { email: normalizeEmail(input.email), members: prev.members, isNewAccount: false } };
  }
  let memberId: string;
  try {
    const r = await createMemberWithPass(s.user.id, { ...input, membership: { status: msStatus, startDate: str(f, "msStart") || null, endDate: str(f, "msEnd") || null }, confirmLinkExisting: confirm });
    memberId = r.memberId;
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    if (/member_external_ref_unique/i.test(String(e))) return { error: "Deze externe referentie bestaat al bij een ander lid." };
    if (/duplicate key|member_member_number/i.test(String(e))) return { error: "Dit lidnummer bestaat al." };
    console.error("lid aanmaken mislukt", e instanceof Error ? e.message : "onbekend");
    return { error: "Aanmaken mislukt. Probeer het opnieuw." };
  }
  await processOutbox(5).catch(() => undefined); // pas na commit versturen
  revalidatePath("/beheer", "layout");
  redirect(`/beheer/leden/${memberId}?msg=${encodeURIComponent("Lid en pas aangemaakt. De onboardingmail is klaargezet.")}`);
}

export async function updateMemberAction(f: FormData) {
  const s = await requireStaff("beheer", "members.write");
  const id = str(f, "id");
  await flow(`/beheer/leden/${id}`, async () => {
    const fullName = str(f, "fullName");
    const email = str(f, "email");
    if (!fullName || fullName.length > 120) throw new DomainError("v", "Naam is verplicht (max 120 tekens).");
    if (email && !isValidEmail(email)) throw new DomainError("v", "Ongeldig e-mailadres.");
    const externalRef = str(f, "externalRef");
    if (externalRef && !/^[A-Za-z0-9._\-/:]{1,64}$/.test(externalRef)) throw new DomainError("v", "Externe referentie mag alleen letters, cijfers en . _ - / : bevatten (max 64).");
    try {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(schema.member).where(and(eq(schema.member.id, id), isNull(schema.member.deletedAt))).for("update");
      if (!m) throw new DomainError("not_found", "Lid niet gevonden.");
      await tx
        .update(schema.member)
        .set({ fullName, email: email ? normalizeEmail(email) : null, membershipNote: str(f, "membershipNote").slice(0, 300) || null, externalRef: externalRef || null, updatedAt: new Date() })
        .where(eq(schema.member.id, id));
      // Alleen veldnamen loggen, geen waarden.
      await audit({ actor: s.user.id, action: "member.update", targetType: "member", targetId: id, metadata: { emailChanged: (m.email ?? "") !== (email ? normalizeEmail(email) : ""), nameChanged: m.fullName !== fullName, externalRefChanged: (m.externalRef ?? "") !== externalRef } }, tx);
    });
    } catch (e) {
      if (/member_external_ref_unique/i.test(String(e))) throw new DomainError("dup", "Deze externe referentie bestaat al bij een ander lid.");
      throw e;
    }
    return "Gegevens opgeslagen. Het e-mailadres van een lid wijzigt het account niet; koppelen gebeurt apart.";
  });
}

export async function deactivateAction(f: FormData) {
  const s = await requireStaff("beheer", "passes.manage");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de actie met het vinkje.");
    await deactivatePass(str(f, "passId"), s.user.id, str(f, "reason"));
    return "Pas gedeactiveerd. De QR-code is direct ongeldig.";
  });
}

export async function reactivateAction(f: FormData) {
  const s = await requireStaff("beheer", "passes.manage");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de actie met het vinkje.");
    await reactivatePass(str(f, "passId"), s.user.id, str(f, "reason"));
    return "Pas opnieuw geactiveerd.";
  });
}

export async function reissueAction(f: FormData) {
  const s = await requireStaff("beheer", "passes.manage");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de actie met het vinkje.");
    const reason = str(f, "kind");
    if (!["reissued", "lost", "leaked"].includes(reason)) throw new DomainError("v", "Kies een reden.");
    await reissuePass(id, s.user.id, reason as "reissued" | "lost" | "leaked", str(f, "reason"));
    return "Nieuwe pas uitgegeven. De oude QR-code is definitief ingetrokken.";
  });
}

export async function revokeAction(f: FormData) {
  const s = await requireStaff("beheer", "passes.manage");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de actie met het vinkje.");
    const kind = str(f, "kind");
    const reason = kind === "lost" || kind === "leaked" ? kind : "admin";
    await revokePass(str(f, "passId"), s.user.id, reason, str(f, "reason"));
    return reason === "lost" ? "Pas als verloren gemarkeerd en definitief ingetrokken." : "Pas definitief ingetrokken.";
  });
}

export async function deleteMemberAction(f: FormData) {
  const s = await requireStaff("beheer", "members.delete");
  const id = str(f, "memberId");
  // Geen bulkverwijdering: altijd één lid, alleen na archivering, met reden en getypte bevestiging (het lidnummer).
  await flow(`/beheer/leden/${id}`, async () => {
    const [m] = await db.select({ n: schema.member.memberNumber }).from(schema.member).where(eq(schema.member.id, id));
    if (!m || str(f, "typed") !== m.n) throw new DomainError("confirm", "Typ het lidnummer om te bevestigen.");
    await deleteMember(id, s.user.id, str(f, "reason"), { requireArchived: true });
    return "Lid verwijderd; de pas is direct ongeldig. Accounts en andere leden zijn ongemoeid gelaten. Definitief wissen volgt na de bewaartermijn.";
  });
}

export async function membershipAction(f: FormData) {
  const s = await requireStaff("beheer", "members.write");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    const action = str(f, "action") as MembershipAction;
    if (!["activate", "suspend", "end", "update"].includes(action)) throw new DomainError("v", "Onbekende actie.");
    if (action !== "update" && f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de actie met het vinkje.");
    await changeMembership(s.user.id, id, action, { startDate: f.has("startDate") ? str(f, "startDate") : undefined, endDate: f.has("endDate") ? str(f, "endDate") : undefined, reason: f.has("reason") ? str(f, "reason") : undefined });
    return { activate: "Lidmaatschap actief.", suspend: "Lidmaatschap geschorst; scans zijn nu ongeldig.", end: "Lidmaatschap beëindigd; scans zijn nu ongeldig. Ledengegevens en passen blijven bewaard.", update: "Lidmaatschap bijgewerkt." }[action];
  });
}

export async function archiveMemberAction(f: FormData) {
  const s = await requireStaff("beheer", "members.write");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de actie met het vinkje.");
    await archiveMember(id, s.user.id, str(f, "reason"));
    return "Lid gearchiveerd. Scans zijn ongeldig en het lid staat niet meer in de standaardlijst. Dit kan worden teruggedraaid.";
  });
}

export async function unarchiveMemberAction(f: FormData) {
  const s = await requireStaff("beheer", "members.write");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    await unarchiveMember(id, s.user.id, str(f, "reason"));
    return "Lid hersteld uit het archief.";
  });
}

export async function linkAccountAction(f: FormData) {
  const s = await requireStaff("beheer", "access.manage");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    const email = normalizeEmail(str(f, "email"));
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de koppeling met het vinkje.");
    const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    if (!u) throw new DomainError("not_found", "Geen ledenaccount met dit e-mailadres.");
    await linkMemberToAccount(s.user.id, id, u.id);
    return "Lid gekoppeld aan het account.";
  });
}

export async function unlinkAccountAction(f: FormData) {
  const s = await requireStaff("beheer", "access.manage");
  const id = str(f, "memberId");
  const userId = str(f, "userId");
  // Vanaf de accountpagina terug naar die pagina, anders naar het lid.
  await flow(str(f, "from") === "account" ? `/beheer/ledenaccounts/${encodeURIComponent(userId)}` : `/beheer/leden/${id}`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig het ontkoppelen met het vinkje.");
    await unlinkMemberFromAccount(s.user.id, id, userId);
    return "Account ontkoppeld; het lid is niet meer zichtbaar in dat account. Lid, lidmaatschap en pas blijven bestaan.";
  });
}

export async function resendInviteAction(f: FormData) {
  const s = await requireStaff("beheer", "email.view");
  const id = str(f, "memberId");
  await flow(`/beheer/leden/${id}`, async () => {
    if (!(await rateLimit(`resend:${s.user.id}`, 20, 3600))) throw new DomainError("rl", "Te vaak opnieuw verstuurd. Probeer het later opnieuw.");
    try {
      await resendInvitation(str(f, "userId"), id);
    } catch (e) {
      if (e instanceof Error && e.message === "already_active") throw new DomainError("active", "Dit account is al geactiveerd; er wordt geen nieuwe activatiecode gestuurd.");
      throw e;
    }
    await processOutbox(5).catch(() => undefined);
    await audit({ actor: s.user.id, action: "email.resend_invitation", targetType: "member", targetId: id });
    return "Uitnodiging opnieuw klaargezet.";
  });
}

/* ------------------------------ import ------------------------------ */

export async function previewImportAction(_: unknown, f: FormData): Promise<{ error?: string; batchId?: string }> {
  const s = await requireStaff("beheer", "import");
  if (!(await rateLimit(`import:${s.user.id}`, 20, 3600))) return { error: "Te veel imports. Probeer het later opnieuw." };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Kies een CSV-bestand." };
  if (file.size > CSV_MAX_BYTES) return { error: "Het bestand is te groot (max 1 MB)." };
  if (!/\.csv$/i.test(file.name) || !["text/csv", "text/plain", "application/vnd.ms-excel", ""].includes(file.type)) return { error: "Alleen .csv-bestanden zijn toegestaan." };
  try {
    const p = await startImport(s.user.id, await file.text());
    return { batchId: p.batchId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Verwerken mislukt." };
  }
}

/** Stap 2: kolomkoppeling → voorbeeld. */
export async function mapImportAction(f: FormData) {
  const s = await requireStaff("beheer", "import");
  const batchId = str(f, "batchId");
  const n = Number(str(f, "cols")) || 0;
  const columns = Array.from({ length: Math.min(n, 60) }, (_, i) => {
    const v = str(f, `col${i}`);
    return (FIELD_KEYS as string[]).includes(v) ? (v as FieldKey) : "";
  });
  const matchKey: MatchKey = str(f, "matchKey") === "externalRef" ? "externalRef" : "memberNumber";
  await flow(`/beheer/import?batch=${encodeURIComponent(batchId)}`, async () => {
    const p = await previewMapped(s.user.id, batchId, { columns, matchKey });
    return `Voorbeeld gemaakt: ${p.counts.new} nieuw, ${p.counts.update} bijwerken, ${p.counts.unchanged} ongewijzigd, ${p.counts.error} met fouten, ${p.counts.review} te beoordelen. Er is nog niets opgeslagen.`;
  });
}

export async function resetMappingAction(f: FormData) {
  const s = await requireStaff("beheer", "import");
  const batchId = str(f, "batchId");
  await resetToMapping(s.user.id, batchId);
  redirect(`/beheer/import?batch=${encodeURIComponent(batchId)}`);
}

export async function commitImportAction(f: FormData) {
  const s = await requireStaff("beheer", "import");
  const batchId = str(f, "batchId");
  await flow(`/beheer/import`, async () => {
    if (f.get("confirm") !== "on") throw new DomainError("confirm", "Bevestig de import met het vinkje.");
    const accept = f.getAll("acceptDup").map((v) => Number(v)).filter((v) => Number.isInteger(v));
    const r = await commitImport(s.user.id, batchId, { confirm: true, confirmGroups: f.get("confirmGroups") === "on", acceptDuplicates: accept });
    return `Import voltooid: ${r.created} nieuw, ${r.updated} bijgewerkt, ${r.unchanged} ongewijzigd, ${r.skipped} overgeslagen. Onboardingmails voor nieuwe accounts zijn klaargezet.`;
  });
}

/* ------------------------------ accounts (staf) ------------------------------ */

async function activeSysadmins(excludeId?: string) {
  const rows = await db.select({ id: schema.user.id }).from(schema.user).where(and(eq(schema.user.role, "sysadmin"), isNull(schema.user.disabledAt)));
  return rows.filter((r) => r.id !== excludeId).length;
}

export async function createStaffAction(f: FormData) {
  const s = await requireStaff("beheer", "staff.manage");
  await flow("/beheer/accounts", async () => {
    const email = normalizeEmail(str(f, "email"));
    const name = str(f, "name");
    const role = str(f, "role") as Role;
    if (!isValidEmail(email) || !name || name.length > 120) throw new DomainError("v", "Vul een geldige naam en e-mailadres in.");
    if (!["scanner", "manager", "sysadmin"].includes(role)) throw new DomainError("v", "Kies een rol.");
    const [exists] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    if (exists) throw new DomainError("exists", "Dit e-mailadres is al in gebruik. Gebruik een persoonlijk adres per medewerker.");
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values({ id, name, email, role, emailVerified: false });
      await tx.insert(schema.emailOutbox).values({ kind: "invitation", idempotencyKey: `invite:${id}`, userId: id });
      await audit({ actor: s.user.id, action: "staff.create", targetType: "user", targetId: id, metadata: { role } }, tx);
    });
    await processOutbox(5).catch(() => undefined);
    return "Staf-account aangemaakt en uitnodiging klaargezet. Het account moet MFA instellen bij de eerste keer inloggen.";
  });
}

export async function changeRoleAction(f: FormData) {
  const s = await requireStaff("beheer", "staff.manage");
  await flow("/beheer/accounts", async () => {
    const id = str(f, "userId");
    const role = str(f, "role") as Role;
    if (!(ROLES as readonly string[]).includes(role) || role === "member") throw new DomainError("v", "Ongeldige rol.");
    if (id === s.user.id) throw new DomainError("self", "Je kunt je eigen rol niet wijzigen.");
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id));
    if (!u || u.role === "member") throw new DomainError("not_found", "Staf-account niet gevonden.");
    if (u.role === "sysadmin" && role !== "sysadmin" && (await activeSysadmins(id)) < 1) throw new DomainError("last", "Er moet minimaal één actieve systeembeheerder blijven.");
    await db.transaction(async (tx) => {
      await tx.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, id));
      await tx.delete(schema.session).where(eq(schema.session.userId, id)); // nieuwe rechten gelden direct
      await audit({ actor: s.user.id, action: "staff.role_change", targetType: "user", targetId: id, metadata: { from: u.role, to: role } }, tx);
    });
    return "Rol gewijzigd; bestaande sessies zijn beëindigd.";
  });
}

export async function toggleStaffAction(f: FormData) {
  const s = await requireStaff("beheer", "staff.manage");
  await flow("/beheer/accounts", async () => {
    const id = str(f, "userId");
    const disable = str(f, "disable") === "1";
    if (id === s.user.id) throw new DomainError("self", "Je kunt je eigen account niet blokkeren.");
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id));
    if (!u || u.role === "member") throw new DomainError("not_found", "Staf-account niet gevonden.");
    if (disable && u.role === "sysadmin" && (await activeSysadmins(id)) < 1) throw new DomainError("last", "Er moet minimaal één actieve systeembeheerder blijven.");
    await db.transaction(async (tx) => {
      await tx.update(schema.user).set({ disabledAt: disable ? new Date() : null, updatedAt: new Date() }).where(eq(schema.user.id, id));
      if (disable) await tx.delete(schema.session).where(eq(schema.session.userId, id));
      await audit({ actor: s.user.id, action: disable ? "staff.disable" : "staff.enable", targetType: "user", targetId: id }, tx);
    });
    return disable ? "Account geblokkeerd en afgemeld." : "Account weer actief.";
  });
}

/** E-mailadres van een staf-account wijzigen (ook voor de eerste systeembeheerder). Nieuw adres moet opnieuw activeren. */
export async function changeStaffEmailAction(f: FormData) {
  const s = await requireStaff("beheer", "staff.manage");
  await flow("/beheer/accounts", async () => {
    const id = str(f, "userId");
    const email = normalizeEmail(str(f, "email"));
    if (!isValidEmail(email)) throw new DomainError("v", "Ongeldig e-mailadres.");
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id));
    if (!u || u.role === "member") throw new DomainError("not_found", "Staf-account niet gevonden.");
    const [dup] = await db.select({ id: schema.user.id }).from(schema.user).where(and(eq(schema.user.email, email), sql`${schema.user.id} <> ${id}`));
    if (dup) throw new DomainError("exists", "Dit e-mailadres is al in gebruik.");
    await db.transaction(async (tx) => {
      await tx.update(schema.user).set({ email, emailVerified: false, updatedAt: new Date() }).where(eq(schema.user.id, id));
      await tx.delete(schema.session).where(eq(schema.session.userId, id));
      await tx.insert(schema.emailOutbox).values({ kind: "invitation", idempotencyKey: `invite:${id}:email:${Date.now()}`, userId: id });
      await audit({ actor: s.user.id, action: "staff.email_change", targetType: "user", targetId: id }, tx);
    });
    await processOutbox(5).catch(() => undefined);
    return "E-mailadres gewijzigd. Het account is afgemeld en krijgt een activatielink op het nieuwe adres.";
  });
}

export async function resendStaffInviteAction(f: FormData) {
  const s = await requireStaff("beheer", "staff.manage");
  await flow("/beheer/accounts", async () => {
    try {
      await resendInvitation(str(f, "userId"), null);
    } catch (e) {
      if (e instanceof Error && e.message === "already_active") throw new DomainError("active", "Dit account is al geactiveerd.");
      throw e;
    }
    await processOutbox(5).catch(() => undefined);
    await audit({ actor: s.user.id, action: "email.resend_invitation", targetType: "user", targetId: str(f, "userId") });
    return "Uitnodiging opnieuw klaargezet.";
  });
}

