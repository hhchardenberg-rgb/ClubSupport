import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset } from "./helpers";
import { amsterdamToday } from "@/lib/membership";

vi.mock("@/server/email/provider", () => ({ sendMail: async () => ({ ok: true, ref: "r" }) }));
beforeEach(reset);

const day = (offset: number) => {
  const d = new Date(`${amsterdamToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const acc = await import("@/server/accounts");
  const admin = await makeUser("adm", "manager");
  const a = await acc.createMemberWithPass(admin, { memberNumber: "R1", fullName: "Anna Oud", email: "fam@example.test" });
  const b = await acc.createMemberWithPass(admin, { memberNumber: "R2", fullName: "Bram Oud", email: "fam@example.test", confirmLinkExisting: true });
  const other = await acc.createMemberWithPass(admin, { memberNumber: "R3", fullName: "Vreemd Lid", email: "ander@example.test" });
  return { admin, a, b, other, family: a.userId!, outsider: other.userId! };
}

describe("wijzigingsverzoeken van leden", () => {
  it("een lid kan alleen voor expliciet gekoppelde leden een verzoek doen; ongeldige invoer en dubbele verzoeken worden geweigerd", async () => {
    const { a, b, other, family, outsider } = await setup();
    const rq = await import("@/server/requests");
    await expect(rq.createChangeRequest(family, other.memberId, "details", { fullName: "Hacker" })).rejects.toMatchObject({ code: "not_found" }); // IDOR
    await expect(rq.createChangeRequest(outsider, a.memberId, "details", { fullName: "Hacker" })).rejects.toMatchObject({ code: "not_found" });
    await expect(rq.createChangeRequest(family, a.memberId, "onzin", {})).rejects.toMatchObject({ code: "invalid" });
    await expect(rq.createChangeRequest(family, a.memberId, "details", { fullName: "Anna Oud" })).rejects.toMatchObject({ code: "no_change" });
    await expect(rq.createChangeRequest(family, a.memberId, "details", { email: "geen-mail" })).rejects.toMatchObject({ code: "invalid" });
    await expect(rq.createChangeRequest(family, a.memberId, "cancellation", { endDate: day(-1) })).rejects.toMatchObject({ code: "invalid" });
    await expect(rq.createChangeRequest(family, a.memberId, "cancellation", { endDate: day(400) })).rejects.toMatchObject({ code: "invalid" });
    await expect(rq.createChangeRequest(family, a.memberId, "cancellation", { endDate: "31-02-2027" })).rejects.toMatchObject({ code: "invalid" });
    const id = await rq.createChangeRequest(family, a.memberId, "details", { fullName: "Anna Nieuw", note: "getrouwd" });
    await expect(rq.createChangeRequest(family, a.memberId, "details", { fullName: "Nog een" })).rejects.toMatchObject({ code: "exists" });
    await rq.createChangeRequest(family, b.memberId, "details", { fullName: "Bram Nieuw" }); // ander lid: wel toegestaan
    expect((await rq.listRequestsForAccount(family)).map((r) => r.memberName).sort()).toEqual(["Anna Oud", "Bram Oud"]);
    expect(await rq.listRequestsForAccount(outsider)).toEqual([]); // niemand anders ziet deze verzoeken
    expect(await rq.pendingRequestCount()).toBe(2);
    // intrekken: alleen eigen verzoeken
    await expect(rq.withdrawChangeRequest(outsider, id)).rejects.toMatchObject({ code: "not_found" });
    await rq.withdrawChangeRequest(family, id);
    await expect(rq.withdrawChangeRequest(family, id)).rejects.toMatchObject({ code: "not_found" });
    expect(await rq.pendingRequestCount()).toBe(1);
  });

  it("er verandert niets vóór goedkeuring; goedkeuren voert door, legt vast en mailt; afwijzen vereist reden en wijzigt niets", async () => {
    const { admin, a, b, family } = await setup();
    const rq = await import("@/server/requests");
    const { db, schema } = await import("@/db");
    const id1 = await rq.createChangeRequest(family, a.memberId, "details", { fullName: "Anna Nieuw", email: "Anna.Nieuw@Example.test" });
    expect((await db.select().from(schema.member).where(eq(schema.member.id, a.memberId)))[0].fullName).toBe("Anna Oud"); // nog niets gewijzigd
    await expect(rq.decideChangeRequest(admin, id1, false, "")).rejects.toMatchObject({ code: "reason_required" });
    await rq.decideChangeRequest(admin, id1, true, "");
    const m = (await db.select().from(schema.member).where(eq(schema.member.id, a.memberId)))[0];
    expect(m).toMatchObject({ fullName: "Anna Nieuw", email: "anna.nieuw@example.test" });
    await expect(rq.decideChangeRequest(admin, id1, true, "")).rejects.toMatchObject({ code: "not_pending" });
    // inlog-e-mailadres van het account blijft ongewijzigd
    expect((await db.select().from(schema.user).where(eq(schema.user.id, family)))[0].email).toBe("fam@example.test");
    const id2 = await rq.createChangeRequest(family, b.memberId, "details", { fullName: "Bram Nieuw" });
    await rq.decideChangeRequest(admin, id2, false, "Niet te verifiëren");
    expect((await db.select().from(schema.member).where(eq(schema.member.id, b.memberId)))[0].fullName).toBe("Bram Oud");
    const mine = await rq.listRequestsForAccount(family);
    expect(mine.find((r) => r.id === id2)).toMatchObject({ status: "rejected", decisionNote: "Niet te verifiëren" });
    const notices = (await db.select().from(schema.emailOutbox)).filter((o) => o.kind === "notice");
    expect(notices).toHaveLength(2);
    expect(notices.every((n) => n.userId === family)).toBe(true);
    const actions = (await db.select().from(schema.auditEvent)).map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["request.create", "request.approve", "request.reject", "member.update"]));
    expect(JSON.stringify(await db.select().from(schema.auditEvent))).not.toContain("anna.nieuw@example.test"); // geen persoonsgegevens in audit
  });

  it("opzegging: einddatum in de toekomst laat het lidmaatschap lopen tot dan (daarna oud-lid); einddatum vandaag beëindigt direct", async () => {
    const { admin, a, b, family } = await setup();
    const rq = await import("@/server/requests");
    const { currentMembership } = await import("@/server/memberships");
    const { scanToken } = await import("@/server/passes");
    const { tokenOf } = await import("./helpers");
    const id1 = await rq.createChangeRequest(family, a.memberId, "cancellation", { endDate: day(10), note: "verhuisd" });
    await rq.decideChangeRequest(admin, id1, true, "");
    expect(await currentMembership(a.memberId)).toBe("valid"); // loopt tot de einddatum
    expect(await currentMembership(a.memberId, day(11))).toBe("expired"); // daarna oud-lid
    const id2 = await rq.createChangeRequest(family, b.memberId, "cancellation", { endDate: day(0) });
    await rq.decideChangeRequest(admin, id2, true, "");
    expect(await currentMembership(b.memberId)).toBe("ended");
    expect((await scanToken((await tokenOf(b.passId))!, "scn")).outcome).toBe("membership_invalid");
    // niet meer mogelijk voor een al beëindigd lidmaatschap
    await expect(rq.createChangeRequest(family, b.memberId, "cancellation", { endDate: day(5) })).rejects.toMatchObject({ code: "no_membership" });
  });

  it("goedkeuren van een e-mailadres van een staf-account of voor een gearchiveerd lid wordt geweigerd; verzoek blijft dan open voor afwijzing", async () => {
    const { admin, a, b, family } = await setup();
    const rq = await import("@/server/requests");
    const { archiveMember } = await import("@/server/memberships");
    await makeUser("scn", "scanner");
    const id1 = await rq.createChangeRequest(family, a.memberId, "details", { email: "scn@example.test" });
    await expect(rq.decideChangeRequest(admin, id1, true, "")).rejects.toMatchObject({ code: "staff_email" });
    const id2 = await rq.createChangeRequest(family, b.memberId, "details", { fullName: "Bram X" });
    await archiveMember(b.memberId, admin, "weg");
    await expect(rq.decideChangeRequest(admin, id2, true, "")).rejects.toMatchObject({ code: "member_gone" });
    await rq.decideChangeRequest(admin, id1, false, "Niet toegestaan");
    expect(await rq.pendingRequestCount()).toBe(1);
  });
});
