import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeMember, makeUser, reset, tokenOf } from "./helpers";

beforeEach(reset);

describe("tokens en QR-inhoud (test 1)", () => {
  it("token is opaque, 256 bit, bevat geen persoonsgegevens en wordt niet leesbaar opgeslagen", async () => {
    const { db, schema } = await import("@/db");
    const { member, passId } = await makeMember(1, "Jan Jansen");
    const token = (await tokenOf(passId))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const pii of [member.fullName, member.memberNumber, member.email!, "Jansen"]) expect(token.toLowerCase()).not.toContain(pii.toLowerCase());
    const [p] = await db.select().from(schema.pass).where(eq(schema.pass.id, passId));
    expect(JSON.stringify(p)).not.toContain(token);
    expect(p.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("tokens zijn uniek", async () => {
    const tokens = new Set<string>();
    for (let i = 1; i <= 20; i++) tokens.add((await tokenOf((await makeMember(i)).passId))!);
    expect(tokens.size).toBe(20);
  });
});

describe("scan (tests 2, 5, 7)", () => {
  it("geldig: geeft alleen naam en lidnummer", async () => {
    const { scanToken } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const { passId } = await makeMember(1, "Piet");
    const r = await scanToken(await tokenOf(passId), s);
    expect(r).toEqual({ outcome: "valid", name: "Piet 1", memberNumber: "T1" });
    expect(Object.keys(r).sort()).toEqual(["memberNumber", "name", "outcome"]);
  });
  it("pas blijft geldig ondanks tijdsverloop of ledennotitie (geen vervaldatum)", async () => {
    const { db, schema } = await import("@/db");
    const { scanToken } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const { member, passId } = await makeMember(1);
    await db.update(schema.pass).set({ issuedAt: new Date("2000-01-01") }).where(eq(schema.pass.id, passId));
    await db.update(schema.member).set({ membershipNote: "contributie niet betaald" }).where(eq(schema.member.id, member.id));
    expect((await scanToken(await tokenOf(passId), s)).outcome).toBe("valid");
  });
  it("onbekend, gemanipuleerd en misvormd geven generiek 'unknown' zonder gegevens", async () => {
    const { scanToken } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const { passId } = await makeMember(1);
    const t = (await tokenOf(passId))!;
    const flipped = t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
    for (const bad of [flipped, "x".repeat(43), "", "kort", null, 123, { a: 1 }, "A".repeat(10000)]) {
      expect(await scanToken(bad, s)).toEqual({ outcome: "unknown" });
    }
  });
  it("te veel scans worden begrensd", async () => {
    const { scanToken } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    let limited = 0;
    for (let i = 0; i < 70; i++) if ((await scanToken("A".repeat(43), s)).outcome === "rate_limited") limited++;
    expect(limited).toBe(10);
  });
  it("scan-log bevat geen ruwe token", async () => {
    const { db, schema } = await import("@/db");
    const { scanToken } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const { passId } = await makeMember(1);
    const t = (await tokenOf(passId))!;
    await scanToken(t, s);
    expect(JSON.stringify(await db.select().from(schema.scanEvent))).not.toContain(t);
  });
});

describe("intrekking (test 4)", () => {
  it("deactiveren maakt de token direct ongeldig; heractiveren herstelt dezelfde pas", async () => {
    const { scanToken, deactivatePass, reactivatePass } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const a = await makeUser("admin1", "manager");
    const { passId } = await makeMember(1);
    const t = (await tokenOf(passId))!;
    await deactivatePass(passId, a, "test");
    expect((await scanToken(t, s)).outcome).toBe("inactive");
    await reactivatePass(passId, a, "fout");
    expect((await scanToken(t, s)).outcome).toBe("valid");
  });
  it("verwijderen maakt de pas direct ongeldig en onzichtbaar; geen persoonsgegevens in scanresultaat", async () => {
    const { scanToken, deleteMember } = await import("@/server/passes");
    const s = await makeUser("scanner1", "scanner");
    const a = await makeUser("admin1", "manager");
    const { member, passId } = await makeMember(1);
    const t = (await tokenOf(passId))!;
    await deleteMember(member.id, a, "verzoek lid");
    expect(await scanToken(t, s)).toEqual({ outcome: "revoked" });
    expect(await tokenOf(passId)).toBeNull();
  });
  it("heruitgifte trekt de oude token onomkeerbaar in en geeft een nieuwe uit", async () => {
    const { scanToken, reissuePass, reactivatePass, revealToken } = await import("@/server/passes");
    const { db, schema } = await import("@/db");
    const s = await makeUser("scanner1", "scanner");
    const a = await makeUser("admin1", "manager");
    const { member, passId } = await makeMember(1);
    const oldT = (await tokenOf(passId))!;
    const r = await reissuePass(member.id, a, "lost", "telefoon kwijt");
    const newT = revealToken((await db.select().from(schema.pass).where(eq(schema.pass.id, r.passId)))[0])!;
    expect(newT).not.toBe(oldT);
    expect(await scanToken(oldT, s)).toEqual({ outcome: "revoked" });
    expect((await scanToken(newT, s)).outcome).toBe("valid");
    await expect(reactivatePass(passId, a, "terug")).rejects.toMatchObject({ code: "revoked_final" });
    expect((await scanToken(oldT, s)).outcome).toBe("revoked");
  });
  it("maximaal één levende pas per lid (database-constraint)", async () => {
    const { db } = await import("@/db");
    const { issuePassTx } = await import("@/server/passes");
    const { member } = await makeMember(1);
    await expect(db.transaction((tx) => issuePassTx(tx, member.id, null))).rejects.toThrow();
  });
  it("reden is verplicht en acties worden geaudit zonder tokens", async () => {
    const { db, schema } = await import("@/db");
    const { deactivatePass } = await import("@/server/passes");
    const a = await makeUser("admin1", "manager");
    const { passId } = await makeMember(1);
    await expect(deactivatePass(passId, a, " ")).rejects.toMatchObject({ code: "reason_required" });
    await deactivatePass(passId, a, "reden");
    const events = await db.select().from(schema.auditEvent);
    expect(events.map((e) => e.action)).toContain("pass.deactivate");
    expect(JSON.stringify(events)).not.toContain((await tokenOf(passId))!);
  });
});
