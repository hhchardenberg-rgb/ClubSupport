import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { makeMember, makeUser, reset } from "./helpers";

beforeEach(reset);

describe("bewaartermijnen en wissen", () => {
  it("wist oude scans/audit en definitief verwijderde leden; laat recente en actieve gegevens staan", async () => {
    const { db, schema } = await import("@/db");
    const { purgeExpiredData } = await import("@/server/retention");
    const { deleteMember } = await import("@/server/passes");
    const admin = await makeUser("admin1", "manager");
    const keep = await makeMember(1, "Blijft");
    const gone = await makeMember(2, "Wordt gewist");
    await deleteMember(gone.member.id, admin, "verzoek");
    await db.insert(schema.scanEvent).values([{ scannerUserId: admin, outcome: "valid", at: new Date(Date.now() - 200 * 86400_000) }, { scannerUserId: admin, outcome: "valid" }]);
    await db.insert(schema.auditEvent).values({ action: "oud", at: new Date(Date.now() - 800 * 86400_000), metadata: {} });
    // te nieuw om te wissen
    const first = await purgeExpiredData();
    expect(first.members).toBe(0); // net verwijderd: nog binnen de bewaartermijn
    expect(first.scans).toBe(1); // scan van 200 dagen geleden is wel verlopen
    expect(first.audit).toBe(1); // auditregel van 800 dagen geleden idem
    await db.execute(sql`update member set deleted_at = now() - interval '100 days' where id = ${gone.member.id}`);
    const r = await purgeExpiredData();
    expect(r).toMatchObject({ scans: 0, members: 1 });
    const members = await db.select().from(schema.member);
    expect(members.map((m) => m.id)).toEqual([keep.member.id]);
    expect(await db.select().from(schema.pass)).toHaveLength(1); // passen van gewist lid zijn mee verwijderd
    expect(await db.select().from(schema.scanEvent)).toHaveLength(1);
    // audit bevat geen persoonsgegevens van het gewiste lid
    expect(JSON.stringify(await db.select().from(schema.auditEvent))).not.toContain("Wordt gewist");
  });

  it("verlopen tokens, oude import-batches en rate-limit-rijen worden opgeruimd", async () => {
    const { db, schema } = await import("@/db");
    const { purgeExpiredData } = await import("@/server/retention");
    const { createLinkToken } = await import("@/server/email/outbox");
    const uid = await makeUser("u1", "member");
    await createLinkToken(uid, "activation", 1000);
    await db.execute(sql`update account_token set expires_at = now() - interval '10 days'`);
    await db.insert(schema.importBatch).values({ createdBy: uid, expiresAt: new Date(Date.now() - 3 * 86400_000), rows: [{ naam: "x" }] });
    const r = await purgeExpiredData();
    expect(r.tokens).toBe(1);
    expect(r.importBatches).toBe(1);
  });

  it("cron-endpoints zijn dicht zonder sterk secret", async () => {
    const { isCronAuthorized } = await import("@/lib/cron-auth");
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer " } }))).toBe(false);
    process.env.CRON_SECRET = "kort";
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer kort" } }))).toBe(false);
    process.env.CRON_SECRET = "een-lang-cron-secret-123";
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer een-lang-cron-secret-123" } }))).toBe(true);
    expect(isCronAuthorized(new Request("http://x", { headers: { authorization: "Bearer fout" } }))).toBe(false);
    expect(isCronAuthorized(new Request("http://x"))).toBe(false);
    delete process.env.CRON_SECRET;
  });
});
