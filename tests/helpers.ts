import { sql } from "drizzle-orm";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.TOKEN_HMAC_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.TOKEN_ENC_KEY ??= Buffer.alloc(32, 9).toString("base64");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

export async function reset() {
  const { db } = await import("@/db");
  await db.execute(sql`truncate table scan_event, security_event, change_request, passkey, two_factor, newsletter_delivery, newsletter, newsletter_optout, membership, audit_event, email_outbox, account_token, account_member_access, pass, member, app_rate_limit, import_batch, "user" restart identity cascade`);
}

export async function makeMember(n = 1, name = "Test Persoon") {
  const { db, schema } = await import("@/db");
  const { issuePassTx } = await import("@/server/passes");
  const [m] = await db.insert(schema.member).values({ memberNumber: `T${n}`, fullName: `${name} ${n}`, email: `t${n}@example.test` }).returning();
  const { passId } = await db.transaction(async (tx) => {
    await tx.insert(schema.membership).values({ memberId: m.id, status: "active" }); // lopend lidmaatschap, anders is de pas niet geldig
    return issuePassTx(tx, m.id, null);
  });
  return { member: m, passId };
}

export async function makeUser(id: string, role = "member") {
  const { db, schema } = await import("@/db");
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role, emailVerified: true });
  return id;
}

export async function tokenOf(passId: string) {
  const { db, schema } = await import("@/db");
  const { revealToken } = await import("@/server/passes");
  const { eq } = await import("drizzle-orm");
  const [p] = await db.select().from(schema.pass).where(eq(schema.pass.id, passId));
  return revealToken(p);
}
