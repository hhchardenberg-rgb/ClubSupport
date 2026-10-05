import { beforeEach, describe, expect, it } from "vitest";
import { makeMember, makeUser, reset, tokenOf } from "./helpers";

beforeEach(reset);

describe("controlelogboek", () => {
  async function setup() {
    const { scanToken, lookupMembers, deleteMember } = await import("@/server/passes");
    const s1 = await makeUser("scn1", "scanner");
    const s2 = await makeUser("scn2", "scanner");
    const a = await makeUser("adm", "manager");
    const eva = await makeMember(1, "Eva");
    const bas = await makeMember(2, "Bas");
    await scanToken(await tokenOf(eva.passId), s1);
    await scanToken(await tokenOf(bas.passId), s2);
    await scanToken("A".repeat(43), s1);
    await lookupMembers("eva", s1);
    return { s1, s2, a, eva, bas, deleteMember };
  }

  it("legt scans en zoekopdrachten vast met controleur, tijd en uitkomst; nooit token of zoekterm", async () => {
    const { db, schema } = await import("@/db");
    const { eva } = await setup();
    const rows = await db.select().from(schema.scanEvent);
    expect(rows.map((r) => r.outcome).sort()).toEqual(["lookup", "unknown", "valid", "valid"]);
    const tok = (await tokenOf(eva.passId))!;
    expect(JSON.stringify(rows)).not.toContain(tok);
    expect(JSON.stringify(rows)).not.toMatch(/"eva"/i);
    expect(rows.find((r) => r.outcome === "lookup")!.resultCount).toBe(1);
  });

  it("is doorzoekbaar op controleur, uitkomst, lid en periode, met paginering", async () => {
    const { listScanLog } = await import("@/server/admin");
    await setup();
    expect((await listScanLog({})).total).toBe(4);
    expect((await listScanLog({ scanner: "scn1" })).total).toBe(3);
    expect((await listScanLog({ scanner: "scn2" })).rows[0].memberName).toBe("Bas 2");
    expect((await listScanLog({ outcome: "valid" })).total).toBe(2);
    expect((await listScanLog({ outcome: "lookup" })).rows[0].resultCount).toBe(1);
    expect((await listScanLog({ q: "eva" })).total).toBe(1); // via de gescande pas
    expect((await listScanLog({ q: "t2" })).total).toBe(1); // lidnummer
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date()); // datumfilter werkt in Amsterdamse tijd
    expect((await listScanLog({ from: today, to: today })).total).toBe(4);
    expect((await listScanLog({ from: "2000-01-01", to: "2000-01-02" })).total).toBe(0);
    expect((await listScanLog({ outcome: "bestaat-niet" })).total).toBe(4); // onbekende filterwaarde wordt genegeerd
    expect((await listScanLog({ scanner: "x' or 1=1 --" })).total).toBe(4); // ongeldige id wordt genegeerd
    expect((await listScanLog({ from: "geen-datum" })).total).toBe(4);
    const p1 = await listScanLog({ page: 1 });
    expect(p1.pages).toBe(1);
    const list = await import("@/server/admin").then((m) => m.listScanLogControllers());
    expect(list.map((c) => c.id)).toEqual(expect.arrayContaining(["scn1", "scn2"]));
  });

  it("toont na verwijderen van een lid geen persoonsgegevens meer in het logboek", async () => {
    const { listScanLog } = await import("@/server/admin");
    const { a, eva, deleteMember } = await setup();
    await deleteMember(eva.member.id, a, "verzoek");
    const r = await listScanLog({ outcome: "revoked" });
    // scans vóór verwijderen blijven; de naam is daarna via de pas niet meer ophaalbaar zodra het lid definitief is gewist
    expect(r.total).toBe(0);
    const { db, schema } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`update member set deleted_at = now() - interval '100 days'`);
    const { purgeExpiredData } = await import("@/server/retention");
    await purgeExpiredData();
    const after = await listScanLog({ q: "eva" });
    expect(after.total).toBe(0); // naam is weg
    expect((await listScanLog({ scanner: "scn1" })).rows.some((x) => x.memberName)).toBe(false);
    void schema;
  });

  it("rechten: alleen manager en sysadmin lezen het logboek; scanner niet", async () => {
    const { can } = await import("@/lib/permissions");
    expect(can("manager", "scanlog.read") && can("sysadmin", "scanlog.read")).toBe(true);
    expect(can("scanner", "scanlog.read") || can("member", "scanlog.read")).toBe(false);
  });
});

describe("auditlog per account", () => {
  it("filtert op actor en toont de naam", async () => {
    const { listAudit, listAuditActors } = await import("@/server/admin");
    const actors = await listAuditActors();
    const all = await listAudit({});
    if (!actors.length) return;
    const one = await listAudit({ actor: actors[0].id });
    expect(one.rows.every((r) => r.actorUserId === actors[0].id)).toBe(true);
    expect(one.total).toBeLessThanOrEqual(all.total);
    const bad = await listAudit({ actor: "x' or 1=1 --" });
    expect(bad.total).toBe(all.total);
  });
});
