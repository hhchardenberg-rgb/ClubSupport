import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset } from "./helpers";

beforeEach(reset);

async function setup() {
  const { db, schema } = await import("@/db");
  const acc = await import("@/server/accounts");
  const admin = await makeUser("admin1", "manager");
  return { db, schema, acc, admin };
}

describe("accountkoppeling en onboarding (tests 3, 11, 12, 13)", () => {
  it("nieuw e-mailadres: nieuw account + precies één uitnodiging, geen wachtwoord of token in de outbox", async () => {
    const { db, schema, acc, admin } = await setup();
    const r = await acc.createMemberWithPass(admin, { memberNumber: "1", fullName: "Ada Test", email: "Ada@Example.test" });
    expect(r.account).toBe("created");
    const users = await db.select().from(schema.user).where(eq(schema.user.email, "ada@example.test"));
    expect(users).toHaveLength(1);
    expect(users[0].emailVerified).toBe(false);
    expect(await db.select().from(schema.authAccount).where(eq(schema.authAccount.userId, users[0].id))).toHaveLength(0);
    const out = await db.select().from(schema.emailOutbox);
    expect(out.map((o) => o.kind)).toEqual(["invitation"]);
    expect(JSON.stringify(out)).not.toMatch(/token|password|wachtwoord/i);
  });

  it("zelfde e-mailadres, tweede lid: koppeling vereist bevestiging; geen tweede account of tweede uitnodiging", async () => {
    const { db, schema, acc, admin } = await setup();
    await acc.createMemberWithPass(admin, { memberNumber: "1", fullName: "Ouder", email: "gezin@example.test" });
    await expect(acc.createMemberWithPass(admin, { memberNumber: "2", fullName: "Kind", email: "gezin@example.test" })).rejects.toMatchObject({ code: "confirm_link_required" });
    // mislukte poging laat geen restanten achter (transactie)
    expect(await db.select().from(schema.member)).toHaveLength(1);
    const r = await acc.createMemberWithPass(admin, { memberNumber: "2", fullName: "Kind", email: "gezin@example.test", confirmLinkExisting: true });
    expect(r.account).toBe("linked");
    expect((await db.select().from(schema.user).where(eq(schema.user.email, "gezin@example.test")))).toHaveLength(1);
    const invites = (await db.select().from(schema.emailOutbox)).filter((o) => o.kind === "invitation");
    expect(invites).toHaveLength(1);
    // twee aparte leden met eigen lidnummer en eigen pas
    const passes = await db.select().from(schema.pass);
    expect(new Set(passes.map((p) => p.tokenHash)).size).toBe(2);
  });

  it("bestaand geactiveerd account krijgt alleen een pasmelding", async () => {
    const { db, schema, acc, admin } = await setup();
    const uid = await makeUser("u-active", "member"); // emailVerified = true
    await db.update(schema.user).set({ email: "bestaand@example.test" }).where(eq(schema.user.id, uid));
    await acc.createMemberWithPass(admin, { memberNumber: "9", fullName: "Nieuw Lid", email: "bestaand@example.test", confirmLinkExisting: true });
    const out = await db.select().from(schema.emailOutbox);
    expect(out.map((o) => o.kind)).toEqual(["pass_notice"]);
    expect(await db.select().from(schema.accountToken)).toHaveLength(0);
  });

  it("plus-tags en punten worden niet samengevoegd", async () => {
    const { acc } = await setup();
    expect(acc.normalizeEmail(" A.B+x@Example.TEST ")).toBe("a.b+x@example.test");
  });

  it("staf-e-mailadres kan niet voor een lid worden gebruikt", async () => {
    const { acc, admin } = await setup();
    await expect(acc.createMemberWithPass(admin, { memberNumber: "3", fullName: "X", email: "admin1@example.test", confirmLinkExisting: true })).rejects.toMatchObject({ code: "staf_email".replace("staf", "staff") });
  });

  it("lid zonder bruikbaar e-mailadres: uitnodiging gemarkeerd als niet verzonden", async () => {
    const { db, schema, acc, admin } = await setup();
    await acc.createMemberWithPass(admin, { memberNumber: "4", fullName: "Geen Mail", email: null });
    const out = await db.select().from(schema.emailOutbox);
    expect(out[0].status).toBe("not_sent_no_address");
    await expect(acc.createMemberWithPass(admin, { memberNumber: "5", fullName: "Fout", email: "geen-adres" })).rejects.toMatchObject({ code: "invalid_email" });
  });

  it("account ziet alleen expliciet gekoppelde passen; ander lid-ID/pas-ID geeft geen toegang", async () => {
    const { db, schema, acc, admin } = await setup();
    const a = await acc.createMemberWithPass(admin, { memberNumber: "1", fullName: "A1", email: "a@example.test" });
    await acc.createMemberWithPass(admin, { memberNumber: "2", fullName: "A2", email: "a@example.test", confirmLinkExisting: true });
    const b = await acc.createMemberWithPass(admin, { memberNumber: "3", fullName: "B1", email: "b@example.test" });
    const listA = await acc.listPassesForAccount(a.userId!);
    expect(listA.map((p) => p.fullName).sort()).toEqual(["A1", "A2"]);
    expect(await acc.getPassForAccount(a.userId!, b.passId)).toBeNull();
    // zelfde e-mailadres, maar niet gekoppeld → onzichtbaar
    const [m] = await db.insert(schema.member).values({ memberNumber: "99", fullName: "Ongekoppeld", email: "a@example.test" }).returning();
    const { issuePassTx } = await import("@/server/passes");
    const { passId } = await db.transaction((tx) => issuePassTx(tx, m.id, null));
    expect((await acc.listPassesForAccount(a.userId!)).map((p) => p.fullName)).not.toContain("Ongekoppeld");
    expect(await acc.getPassForAccount(a.userId!, passId)).toBeNull();
    // ontkoppelen door beheerder trekt toegang direct in en wordt geaudit
    await acc.unlinkMemberFromAccount(admin, a.memberId, a.userId!);
    expect((await acc.listPassesForAccount(a.userId!)).map((p) => p.fullName)).toEqual(["A2"]);
    const actions = (await db.select().from(schema.auditEvent)).map((e) => e.action);
    expect(actions).toContain("access.revoke");
  });
});
