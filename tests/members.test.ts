import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset, tokenOf } from "./helpers";
import { amsterdamToday } from "@/lib/membership";

const sent: string[] = [];
vi.mock("@/server/email/provider", () => ({
  sendMail: async (to: string, mail: { subject: string }) => (sent.push(`${mail.subject}|${to}`), { ok: true, ref: "r" }),
}));

beforeEach(async () => {
  await reset();
  sent.length = 0;
});

const day = (offset: number) => {
  const d = new Date(`${amsterdamToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const acc = await import("@/server/accounts");
  const admin = await makeUser("adm", "manager");
  const scanner = await makeUser("scn", "scanner");
  return { acc, admin, scanner };
}

describe("meerdere leden, één e-mailadres, één account", () => {
  it("een e-mailadres mag bij meerdere leden voorkomen: aparte leden, één account, één uitnodiging, expliciete koppelingen", async () => {
    const { acc, admin } = await setup();
    const { db, schema } = await import("@/db");
    const a = await acc.createMemberWithPass(admin, { memberNumber: "G1", fullName: "Ouder Een", email: "gezin@example.test" });
    const b = await acc.createMemberWithPass(admin, { memberNumber: "G2", fullName: "Kind Twee", email: "Gezin@Example.test", confirmLinkExisting: true });
    const c = await acc.createMemberWithPass(admin, { memberNumber: "G3", fullName: "Kind Drie", email: "gezin@example.test", confirmLinkExisting: true });
    expect(new Set([a.memberId, b.memberId, c.memberId]).size).toBe(3); // niet samengevoegd
    expect(await db.select().from(schema.member)).toHaveLength(3);
    const users = await db.select().from(schema.user).where(eq(schema.user.email, "gezin@example.test"));
    expect(users).toHaveLength(1);
    expect((await db.select().from(schema.accountMemberAccess)).filter((x) => !x.revokedAt)).toHaveLength(3);
    const outbox = await db.select().from(schema.emailOutbox);
    expect(outbox.filter((o) => o.kind === "invitation")).toHaveLength(1); // maximaal één uitnodiging
    // zonder bevestiging wordt nooit stilzwijgend gekoppeld
    await expect(acc.createMemberWithPass(admin, { memberNumber: "G4", fullName: "Vierde", email: "gezin@example.test" })).rejects.toMatchObject({ code: "confirm_link_required" });
  });

  it("plus-adressen zijn aparte adressen en worden niet samengevoegd", async () => {
    const { acc, admin } = await setup();
    const { db, schema } = await import("@/db");
    await acc.createMemberWithPass(admin, { memberNumber: "P1", fullName: "Plus Een", email: "jan@example.test" });
    await acc.createMemberWithPass(admin, { memberNumber: "P2", fullName: "Plus Twee", email: "jan+club@example.test" });
    expect(await db.select().from(schema.user)).toHaveLength(4); // beheerder + scanner + twee aparte ledenaccounts
  });

  it("één account ziet alle expliciet gekoppelde leden met eigen pas- en lidmaatschapsstatus; niet-gekoppelde leden blijven onzichtbaar", async () => {
    const { acc, admin } = await setup();
    const { db, schema } = await import("@/db");
    const m1 = await acc.createMemberWithPass(admin, { memberNumber: "A1", fullName: "Anna", email: "fam@example.test" });
    const m2 = await acc.createMemberWithPass(admin, { memberNumber: "A2", fullName: "Bram", email: "fam@example.test", confirmLinkExisting: true, membership: { endDate: day(-1) } });
    const other = await acc.createMemberWithPass(admin, { memberNumber: "X1", fullName: "Vreemde", email: "ander@example.test" });
    const list = await acc.listMembersForAccount(m1.userId!);
    expect(list.map((l) => l.memberNumber)).toEqual(["A1", "A2"]);
    expect(list.find((l) => l.memberNumber === "A1")).toMatchObject({ membership: "valid", valid: true });
    expect(list.find((l) => l.memberNumber === "A2")).toMatchObject({ membership: "expired", valid: false, passStatus: "active" });
    // niet-gekoppeld lid/pas: geen toegang, ook niet via id
    expect(list.map((l) => l.memberId)).not.toContain(other.memberId);
    expect(await acc.getPassForAccount(m1.userId!, other.passId)).toBeNull();
    expect((await acc.listMembersForAccount(other.userId!)).map((l) => l.memberNumber)).toEqual(["X1"]);
    // ontkoppelen raakt lid, lidmaatschap en pas niet
    await acc.unlinkMemberFromAccount(admin, m2.memberId, m1.userId!);
    expect((await acc.listMembersForAccount(m1.userId!)).map((l) => l.memberNumber)).toEqual(["A1"]);
    expect(await db.select().from(schema.member).where(eq(schema.member.id, m2.memberId))).toHaveLength(1);
    expect(await db.select().from(schema.pass).where(eq(schema.pass.id, m2.passId))).toHaveLength(1);
    expect(await db.select().from(schema.membership).where(eq(schema.membership.memberId, m2.memberId))).toHaveLength(1);
  });
});

describe("scan: pas én lidmaatschap", () => {
  async function member(n: string, ms?: { status?: "active" | "suspended"; startDate?: string; endDate?: string }) {
    const { acc, admin, scanner } = await setup().catch(async () => ({ ...(await setup()) }));
    const r = await acc.createMemberWithPass(admin, { memberNumber: n, fullName: `Lid ${n}`, email: null, membership: ms });
    return { r, admin, scanner, token: (await tokenOf(r.passId))! };
  }

  it("geldig alleen bij actieve pas en geldig lidmaatschap; beëindigd, geschorst, verlopen, nog niet gestart en geen lidmaatschap geven een ongeldige scan met gescheiden redenen", async () => {
    const { scanToken } = await import("@/server/passes");
    const { changeMembership } = await import("@/server/memberships");
    const { db, schema } = await import("@/db");
    const { acc, admin } = await setup();
    const scn = "scn";
    const mk = async (n: string, ms?: Parameters<typeof acc.createMemberWithPass>[1]["membership"]) => {
      const r = await acc.createMemberWithPass(admin, { memberNumber: n, fullName: `Lid ${n}`, email: null, membership: ms });
      return { id: r.memberId, token: (await tokenOf(r.passId))! };
    };
    const ok = await mk("S1");
    expect((await scanToken(ok.token, scn)).outcome).toBe("valid");

    const ended = await mk("S2");
    await changeMembership(admin, ended.id, "end", { reason: "opgezegd" });
    expect(await scanToken(ended.token, scn)).toMatchObject({ outcome: "membership_invalid", memberNumber: "S2" });

    const susp = await mk("S3");
    await changeMembership(admin, susp.id, "suspend", { reason: "onderzoek" });
    expect((await scanToken(susp.token, scn)).outcome).toBe("membership_invalid");
    await changeMembership(admin, susp.id, "activate", {});
    expect((await scanToken(susp.token, scn)).outcome).toBe("valid"); // pas was nooit aangeraakt

    const expired = await mk("S4", { endDate: day(-1) });
    expect((await scanToken(expired.token, scn)).outcome).toBe("membership_invalid");
    const lastDay = await mk("S5", { endDate: day(0) });
    expect((await scanToken(lastDay.token, scn)).outcome).toBe("valid"); // einddatum is de laatste geldige dag
    const future = await mk("S6", { startDate: day(1) });
    expect((await scanToken(future.token, scn)).outcome).toBe("membership_invalid");
    const started = await mk("S7", { startDate: day(0) });
    expect((await scanToken(started.token, scn)).outcome).toBe("valid");

    const none = await mk("S8");
    await db.delete(schema.membership).where(eq(schema.membership.memberId, none.id));
    expect((await scanToken(none.token, scn)).outcome).toBe("membership_invalid"); // fail-safe

    // gedeactiveerde pas blijft "inactive", ook bij geldig lidmaatschap; ingetrokken blijft "revoked"
    const { deactivatePass } = await import("@/server/passes");
    const pid = (await db.select().from(schema.pass).where(eq(schema.pass.memberId, ok.id)))[0].id;
    await deactivatePass(pid, admin, "test");
    expect((await scanToken(ok.token, scn)).outcome).toBe("inactive");
    // scanuitkomst bevat geen reden/lidmaatschapsgegevens
    expect(JSON.stringify(await scanToken(ended.token, scn))).not.toMatch(/ended|expired|suspended|opgezegd/);
  });

  it("zoekresultaat toont 'membership' i.p.v. 'active' als het lidmaatschap niet geldig is", async () => {
    const { lookupMembers } = await import("@/server/passes");
    const { changeMembership } = await import("@/server/memberships");
    const { acc, admin } = await setup();
    const a = await acc.createMemberWithPass(admin, { memberNumber: "L1", fullName: "Zoek Een", email: null });
    const b = await acc.createMemberWithPass(admin, { memberNumber: "L2", fullName: "Zoek Twee", email: null });
    await changeMembership(admin, b.memberId, "end", { reason: "opgezegd" });
    const r = await lookupMembers("zoek", "scn");
    expect(r.ok && r.results.map((x) => [x.memberNumber, x.pass])).toEqual([["L1", "active"], ["L2", "membership"]]);
    void a;
  });

  it("archiveren maakt scans ongeldig zonder iets te wissen; herstellen kan", async () => {
    const { scanToken } = await import("@/server/passes");
    const { archiveMember, unarchiveMember } = await import("@/server/memberships");
    const { acc, admin } = await setup();
    const m = await acc.createMemberWithPass(admin, { memberNumber: "R1", fullName: "Arch Een", email: "arch@example.test" });
    const token = (await tokenOf(m.passId))!;
    await archiveMember(m.memberId, admin, "geen lid meer");
    expect((await scanToken(token, "scn")).outcome).toBe("membership_invalid");
    expect(await acc.listMembersForAccount(m.userId!)).toHaveLength(0); // niet meer zichtbaar voor het account
    await unarchiveMember(m.memberId, admin, "toch lid");
    expect((await scanToken(token, "scn")).outcome).toBe("valid");
    expect(await acc.listMembersForAccount(m.userId!)).toHaveLength(1);
  });
});

describe("pasvervanging", () => {
  it("de oude QR-code is direct server-side ongeldig en blijft dat; de historie blijft bewaard", async () => {
    const { scanToken, reissuePass, revokePass } = await import("@/server/passes");
    const { db, schema } = await import("@/db");
    const { acc, admin } = await setup();
    const m = await acc.createMemberWithPass(admin, { memberNumber: "V1", fullName: "Vervang", email: null });
    const oldToken = (await tokenOf(m.passId))!;
    expect((await scanToken(oldToken, "scn")).outcome).toBe("valid");
    const r = await reissuePass(m.memberId, admin, "lost", "verloren");
    expect((await scanToken(oldToken, "scn")).outcome).toBe("revoked");
    const newToken = (await tokenOf(r.passId))!;
    expect(newToken).not.toBe(oldToken);
    expect((await scanToken(newToken, "scn")).outcome).toBe("valid");
    const passes = await db.select().from(schema.pass).where(eq(schema.pass.memberId, m.memberId));
    expect(passes).toHaveLength(2); // historie bewaard
    const old = passes.find((p) => p.id === m.passId)!;
    expect(old).toMatchObject({ status: "revoked", revocationReason: "lost", tokenCiphertext: null, replacedByPassId: r.passId });
    // als verloren markeren zonder vervanging
    await revokePass(r.passId, admin, "lost", "weer kwijt");
    expect((await scanToken(newToken, "scn")).outcome).toBe("revoked");
  });
});

describe("lidmaatschapsacties raken lid, accounts en pasgeschiedenis niet", () => {
  it("beëindigen en opnieuw starten: nieuwe lidmaatschapsregel, historie bewaard, pas ongewijzigd, alles geaudit", async () => {
    const { changeMembership } = await import("@/server/memberships");
    const { db, schema } = await import("@/db");
    const { acc, admin } = await setup();
    const m = await acc.createMemberWithPass(admin, { memberNumber: "H1", fullName: "Historie", email: "h@example.test" });
    await changeMembership(admin, m.memberId, "end", { reason: "opgezegd", endDate: day(-1) });
    await changeMembership(admin, m.memberId, "activate", { startDate: day(0), reason: "heraanmelding" });
    const ms = await db.select().from(schema.membership).where(eq(schema.membership.memberId, m.memberId));
    expect(ms.map((x) => x.status).sort()).toEqual(["active", "ended"]);
    await expect(changeMembership(admin, m.memberId, "suspend", { reason: "ab" })).rejects.toMatchObject({ code: "reason_required" });
    await expect(changeMembership(admin, m.memberId, "update", { startDate: "2026-02-30" })).rejects.toMatchObject({ code: "invalid_date" });
    await expect(changeMembership(admin, m.memberId, "update", { startDate: day(5), endDate: day(1) })).rejects.toMatchObject({ code: "invalid_range" });
    expect(await db.select().from(schema.member).where(eq(schema.member.id, m.memberId))).toHaveLength(1);
    expect((await db.select().from(schema.pass).where(eq(schema.pass.id, m.passId)))[0].status).toBe("active");
    const actions = (await db.select().from(schema.auditEvent)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["membership.create", "membership.end"]));
    // dubbele lopende lidmaatschappen zijn niet mogelijk (unieke index)
    await expect(db.insert(schema.membership).values({ memberId: m.memberId, status: "suspended" })).rejects.toThrow();
  });
});

describe("archiveren en verwijderen zonder onbedoelde cascade", () => {
  it("verwijderen vereist archivering; accounts en andere gekoppelde leden blijven bestaan; impact vooraf zichtbaar", async () => {
    const { archiveMember, deletionImpact } = await import("@/server/memberships");
    const { deleteMember, scanToken } = await import("@/server/passes");
    const { db, schema } = await import("@/db");
    const { acc, admin } = await setup();
    const a = await acc.createMemberWithPass(admin, { memberNumber: "D1", fullName: "Weg", email: "fam@example.test" });
    const b = await acc.createMemberWithPass(admin, { memberNumber: "D2", fullName: "Blijft", email: "fam@example.test", confirmLinkExisting: true });
    const tokenA = (await tokenOf(a.passId))!;
    await expect(deleteMember(a.memberId, admin, "weg", { requireArchived: true })).rejects.toMatchObject({ code: "archive_first" });
    await archiveMember(a.memberId, admin, "oud lid");
    const impact = await deletionImpact(a.memberId);
    expect(impact).toMatchObject({ passes: 1, memberships: 1 });
    expect(impact.accounts).toEqual([expect.objectContaining({ email: "fam@example.test", otherMembers: 1 })]);
    await deleteMember(a.memberId, admin, "verzoek van het lid", { requireArchived: true });
    expect((await scanToken(tokenA, "scn")).outcome).toBe("revoked");
    // account bestaat nog, het andere lid is intact en gekoppeld
    expect(await db.select().from(schema.user).where(eq(schema.user.email, "fam@example.test"))).toHaveLength(1);
    expect((await acc.listMembersForAccount(a.userId!)).map((l) => l.memberNumber)).toEqual(["D2"]);
    expect((await db.select().from(schema.member).where(eq(schema.member.id, b.memberId)))[0].deletedAt).toBeNull();
    // definitief wissen na de bewaartermijn raakt alleen het verwijderde lid
    await db.update(schema.member).set({ deletedAt: new Date(Date.now() - 400 * 864e5) }).where(eq(schema.member.id, a.memberId));
    const { purgeExpiredData } = await import("@/server/retention");
    await purgeExpiredData();
    expect(await db.select().from(schema.member)).toHaveLength(1);
    expect(await db.select().from(schema.user).where(eq(schema.user.email, "fam@example.test"))).toHaveLength(1);
    expect((await acc.listMembersForAccount(a.userId!))).toHaveLength(1);
  });
});

describe("import: bijwerken, dubbelen, herhaling", () => {
  const CSV = (rows: string[], head = "lidnummer,naam,email,lidmaatschap,begindatum,einddatum") => [head, ...rows].join("\n");

  it("herhaald importeren maakt geen dubbele leden, passen of uitnodigingen; bestaande leden worden bijgewerkt of blijven gelijk", async () => {
    const { previewImport, commitImport } = await import("@/server/import");
    const { db, schema } = await import("@/db");
    const { admin } = await setup();
    const file = CSV(["100,Eerste Lid,een@example.test,actief,,", "101,Tweede Lid,twee@example.test,geschorst,,"]);
    const p1 = await previewImport(admin, file);
    expect(p1.counts).toMatchObject({ new: 2, update: 0 });
    await commitImport(admin, p1.batchId, { confirm: true });
    const p2 = await previewImport(admin, file); // exact hetzelfde bestand
    expect(p2.counts).toMatchObject({ new: 0, update: 0, unchanged: 2, import: 0 });
    const r2 = await commitImport(admin, p2.batchId, { confirm: true });
    expect(r2).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(await db.select().from(schema.member)).toHaveLength(2);
    expect(await db.select().from(schema.pass)).toHaveLength(2);
    expect((await db.select().from(schema.emailOutbox)).filter((o) => o.kind === "invitation")).toHaveLength(2);
    // wijziging: naam en lidmaatschap
    const p3 = await previewImport(admin, CSV(["100,Eerste Lid Gewijzigd,een@example.test,beëindigd,,", "101,Tweede Lid,twee@example.test,actief,,"]));
    expect(p3.counts).toMatchObject({ update: 2 });
    expect(p3.rows[0].changes).toEqual(expect.arrayContaining(["Naam", "Lidmaatschap"]));
    await commitImport(admin, p3.batchId, { confirm: true });
    const m100 = (await db.select().from(schema.member).where(eq(schema.member.memberNumber, "100")))[0];
    expect(m100.fullName).toBe("Eerste Lid Gewijzigd");
    expect((await db.select().from(schema.membership).where(eq(schema.membership.memberId, m100.id)))[0].status).toBe("ended");
    const m101 = (await db.select().from(schema.member).where(eq(schema.member.memberNumber, "101")))[0];
    expect((await db.select().from(schema.membership).where(eq(schema.membership.memberId, m101.id)))[0].status).toBe("active");
    expect(await db.select().from(schema.pass)).toHaveLength(2); // geen nieuwe passen
  });

  it("mogelijke dubbele personen worden gesignaleerd en nooit automatisch samengevoegd of geïmporteerd zonder keuze", async () => {
    const { previewImport, commitImport } = await import("@/server/import");
    const { db, schema } = await import("@/db");
    const { acc, admin } = await setup();
    await acc.createMemberWithPass(admin, { memberNumber: "1", fullName: "Jan de Vries", email: null });
    const p = await previewImport(admin, CSV(["2,jan  de  vries,,,,", "3,Unieke Naam,,,,", "4,Unieke Naam,,,,"]));
    const by = Object.fromEntries(p.rows.map((r) => [r.line, r]));
    expect(by[2]).toMatchObject({ action: "review", status: "review" });
    expect(by[2].duplicateOf).toMatch(/bestaand lid 1/);
    expect(by[3].action).toBe("new");
    expect(by[4]).toMatchObject({ action: "review" });
    expect(by[4].duplicateOf).toMatch(/regel 3/);
    const r = await commitImport(admin, p.batchId, { confirm: true });
    expect(r).toMatchObject({ created: 1, skipped: 2 });
    expect(await db.select().from(schema.member)).toHaveLength(2);
    // bewust toch importeren kan wel, per regel
    const p2 = await previewImport(admin, CSV(["2,jan  de  vries,,,,"]));
    const r2 = await commitImport(admin, p2.batchId, { confirm: true, acceptDuplicates: [2] });
    expect(r2).toMatchObject({ created: 1 });
    expect(await db.select().from(schema.member)).toHaveLength(3);
  });

  it("lidnummer-wijziging, gearchiveerd/verwijderd lid en e-mail als sleutel worden geweigerd; externe referentie als matchsleutel werkt", async () => {
    const { previewImport, previewMapped, startImport, commitImport } = await import("@/server/import");
    const { archiveMember } = await import("@/server/memberships");
    const { db, schema } = await import("@/db");
    const { acc, admin } = await setup();
    const m = await acc.createMemberWithPass(admin, { memberNumber: "10", fullName: "Eerst", email: "e@example.test", externalRef: "EXT-10" });
    const arch = await acc.createMemberWithPass(admin, { memberNumber: "11", fullName: "Oud", email: null });
    await archiveMember(arch.memberId, admin, "oud");
    const p = await previewImport(admin, CSV(["11,Oud Lid,,,,"]));
    expect(p.rows[0].errors.join()).toMatch(/gearchiveerd/);
    // match op externe referentie; afwijkend lidnummer = fout (een lidnummer wijzigt niet via import)
    const s = await startImport(admin, "lidnummer,naam,externe_referentie\n10,Eerst Nieuw,EXT-10\n99,Andere,EXT-10\n");
    const pv = await previewMapped(admin, s.batchId, { columns: s.suggested.columns, matchKey: "externalRef" });
    expect(pv.rows[0]).toMatchObject({ action: "update", changes: ["Naam"] });
    expect(pv.rows[1].errors.join()).toMatch(/Dubbele externe referentie|lidnummer wijkt af/);
    await commitImport(admin, pv.batchId, { confirm: true });
    expect((await db.select().from(schema.member).where(eq(schema.member.id, m.memberId)))[0].fullName).toBe("Eerst Nieuw");
    // een e-mailkolom alleen is geen matchsleutel: zonder lidnummer is de koppeling ongeldig
    const s2 = await startImport(admin, "naam,email\nA,e@example.test\n");
    await expect(previewMapped(admin, s2.batchId, { columns: s2.suggested.columns, matchKey: "memberNumber" })).rejects.toMatchObject({ code: "mapping" });
  });

  it("gedeeld e-mailadres in het bestand geeft één uitnodiging voor meerdere nieuwe leden", async () => {
    const { previewImport, commitImport } = await import("@/server/import");
    const { db, schema } = await import("@/db");
    const { admin } = await setup();
    const p = await previewImport(admin, CSV(["1,Ouder Een,gezin@example.test,,,", "2,Kind Twee,gezin@example.test,,,", "3,Kind Drie,gezin@example.test,,,"]));
    expect(p.groups).toHaveLength(1);
    await commitImport(admin, p.batchId, { confirm: true, confirmGroups: true });
    expect((await db.select().from(schema.emailOutbox)).filter((o) => o.kind === "invitation")).toHaveLength(1);
    expect(sent.filter((x) => x.includes("Activeer"))).toHaveLength(1);
  });
});
