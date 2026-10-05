import { beforeEach, describe, expect, it } from "vitest";
import { makeMember, makeUser, reset } from "./helpers";
import { interpretLookup } from "@/lib/scan-view";

beforeEach(reset);

describe("beperkt zoeken door de controleur (naam / lidnummer)", () => {
  it("vindt op naam en op lidnummer en toont alleen naam, lidnummer en passtatus", async () => {
    const { lookupMembers } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    await makeMember(1, "Anna");
    await makeMember(2, "Bram");
    const byName = await lookupMembers("anna", s);
    expect(byName).toEqual({ ok: true, tooMany: false, results: [{ name: "Anna 1", memberNumber: "T1", pass: "active" }] });
    const byNr = await lookupMembers("t2", s);
    expect(byNr).toMatchObject({ ok: true, results: [{ name: "Bram 2", memberNumber: "T2", pass: "active" }] });
    for (const r of (byName as { results: object[] }).results) expect(Object.keys(r).sort()).toEqual(["memberNumber", "name", "pass"]);
  });

  it("passtatus: gedeactiveerd en geen levende pas; verwijderde leden worden nooit getoond", async () => {
    const { lookupMembers, deactivatePass, reissuePass, deleteMember } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const a = await makeUser("admin1", "manager");
    const m1 = await makeMember(1, "Cora");
    const m2 = await makeMember(2, "Cora");
    const m3 = await makeMember(3, "Cora");
    await deactivatePass(m1.passId, a, "test");
    // revoked zonder nieuwe pas: via verwijderen is het lid weg; via intrekken blijft het lid zonder levende pas
    const { revokePass } = await import("@/server/passes");
    await revokePass(m2.passId, a, "lost", "kwijt");
    await deleteMember(m3.member.id, a, "weg");
    await reissuePass(m1.member.id, a, "reissued", "nieuw").catch(() => undefined);
    const r = await lookupMembers("cora", s);
    expect(r.ok && !r.tooMany).toBe(true);
    const list = (r as { results: { memberNumber: string; pass: string }[] }).results;
    expect(list.map((x) => x.memberNumber).sort()).toEqual(["T1", "T2"]); // T3 (verwijderd) ontbreekt
    expect(list.find((x) => x.memberNumber === "T2")!.pass).toBe("none");
  });

  it("korte zoektermen: alleen exact lidnummer; geen brede lijst; te veel resultaten geeft geen lijst", async () => {
    const { lookupMembers } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    for (let i = 1; i <= 12; i++) await makeMember(i, "Jansen");
    expect(await lookupMembers("ja", s)).toMatchObject({ ok: true, results: [] }); // te kort voor naam
    expect(await lookupMembers("T5", s)).toMatchObject({ ok: true, results: [{ memberNumber: "T5" }] }); // exact nummer mag wel
    expect(await lookupMembers("jansen", s)).toEqual({ ok: true, tooMany: true, results: [] }); // 12 > 8
  });

  it("ongeldige invoer, wildcards en lengte worden veilig afgehandeld", async () => {
    const { lookupMembers } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    await makeMember(1, "Anna");
    for (const bad of [null, undefined, 42, {}, "", "   ", "x".repeat(61), "a\u0000b"]) expect(await lookupMembers(bad, s)).toEqual({ ok: false, reason: "invalid" });
    // % en _ zijn geen jokertekens
    expect(await lookupMembers("%%%", s)).toMatchObject({ ok: true, results: [] });
    expect(await lookupMembers("___", s)).toMatchObject({ ok: true, results: [] });
    expect(await lookupMembers("anna' or 1=1 --", s)).toMatchObject({ ok: true, results: [] });
  });

  it("begrensd per controleur en de zoekterm komt niet in de log", async () => {
    const { db, schema } = await import("@/db");
    const { lookupMembers } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    await makeMember(1, "Geheimnaam");
    await lookupMembers("geheimnaam", s);
    expect(JSON.stringify(await db.select().from(schema.scanEvent))).not.toMatch(/geheimnaam/i);
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await lookupMembers("anna", s) as { reason?: string }).reason === "rate_limited") limited++;
    expect(limited).toBeGreaterThan(0);
  });

  it("rechten: scanner, manager en sysadmin mogen zoeken; leden niet", async () => {
    const { can } = await import("@/lib/permissions");
    expect(can("scanner", "members.lookup") && can("manager", "members.lookup") && can("sysadmin", "members.lookup")).toBe(true);
    expect(can("member", "members.lookup")).toBe(false);
    expect(can("scanner", "members.read")).toBe(false); // geen toegang tot ledenbeheer/ledenlijst
  });

  it("interpretLookup is fail-safe: fouten en afwijkingen geven nooit resultaten", () => {
    expect(interpretLookup(null, null).kind).toBe("unchecked");
    expect(interpretLookup(500, { ok: true, tooMany: false, results: [] }).kind).toBe("unchecked");
    expect(interpretLookup(200, "html").kind).toBe("unchecked");
    expect(interpretLookup(200, { ok: true, tooMany: false, results: [{ name: "A", memberNumber: "1", pass: "valid" }] }).kind).toBe("unchecked");
    expect(interpretLookup(200, { ok: true, tooMany: false, results: Array(9).fill({ name: "A", memberNumber: "1", pass: "active" }) }).kind).toBe("unchecked");
    expect(interpretLookup(401, {}).kind).toBe("session");
    expect(interpretLookup(429, {}).kind).toBe("wait");
    expect(interpretLookup(200, { ok: true, tooMany: true, results: [] }).kind).toBe("tooMany");
    expect(interpretLookup(200, { ok: true, tooMany: false, results: [{ name: "A", memberNumber: "1", pass: "active" }] }).kind).toBe("results");
  });
});
