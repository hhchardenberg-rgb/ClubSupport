/**
 * Demo-/testaccounts met synthetische gegevens (alleen voor testen; niet voor echte leden).
 *   SEED_DEMO=true    maakt ontbrekende demo-accounts aan (bestaande blijven ongewijzigd)
 *   SEED_DEMO=reset   verwijdert en maakt ze opnieuw aan (nieuwe wachtwoorden)
 *   SEED_DEMO=remove  verwijdert alle demo-gegevens
 * Wachtwoorden zijn willekeurig en worden ÉÉN keer in de buildlog getoond. Er wordt geen mail verstuurd.
 * Zet SEED_DEMO na het testen uit en voer 'remove' uit voordat echte leden worden ingevoerd.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { auth } from "../src/lib/auth";
import { db, schema } from "../src/db";
import { issuePassTx } from "../src/server/passes";

const DOMAIN = "example.test";
const PREFIX = "DEMO-";

function password() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // zonder verwarrende tekens
  const b = randomBytes(16);
  const chars = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

const ACCOUNTS = [
  { email: `demo.een@${DOMAIN}`, name: "Demo Eén Pas", role: "member", members: [{ nr: `${PREFIX}1`, name: "Demo Eén" }] },
  {
    email: `demo.gezin@${DOMAIN}`,
    name: "Demo Gezin",
    role: "member",
    members: [
      { nr: `${PREFIX}2`, name: "Demo Gezin Ouder" },
      { nr: `${PREFIX}3`, name: "Demo Gezin Kind Een" },
      { nr: `${PREFIX}4`, name: "Demo Gezin Kind Twee" },
    ],
  },
  { email: `demo.scanner@${DOMAIN}`, name: "Demo Controleur", role: "scanner", members: [] },
] as const;

async function remove() {
  const users = await db.select({ id: schema.user.id }).from(schema.user).where(like(schema.user.email, `%@${DOMAIN}`));
  const ids = users.map((u) => u.id);
  await db.delete(schema.member).where(like(schema.member.memberNumber, `${PREFIX}%`));
  if (ids.length) {
    await db.delete(schema.emailOutbox).where(inArray(schema.emailOutbox.userId, ids));
    await db.delete(schema.user).where(inArray(schema.user.id, ids));
  }
  await db.insert(schema.auditEvent).values({ actorUserId: null, action: "demo.remove", metadata: { accounts: ids.length } });
  console.log(`Demo: ${ids.length} demo-accounts en bijbehorende leden verwijderd.`);
}

async function create() {
  const ctx = await auth.$context;
  const lines: string[] = [];
  for (const a of ACCOUNTS) {
    const [exists] = await db.select().from(schema.user).where(eq(schema.user.email, a.email));
    if (exists) {
      lines.push(`${a.email}: bestaat al (wachtwoord ongewijzigd)`);
      continue;
    }
    const pw = password();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values({ id, name: a.name, email: a.email, role: a.role, emailVerified: true });
      for (const m of a.members) {
        const [row] = await tx.insert(schema.member).values({ memberNumber: m.nr, fullName: m.name, email: a.email, membershipNote: "demo" }).returning();
        await tx.insert(schema.membership).values({ memberId: row.id, status: "active", statusNote: "demo" });
        await issuePassTx(tx, row.id, null);
        await tx.insert(schema.accountMemberAccess).values({ userId: id, memberId: row.id });
      }
      await tx.insert(schema.auditEvent).values({ actorUserId: null, action: "demo.seed", targetType: "user", targetId: id, metadata: { role: a.role, members: a.members.length } });
    });
    await ctx.internalAdapter.linkAccount({ userId: id, providerId: "credential", accountId: id, password: await ctx.password.hash(pw) });
    lines.push(`${a.email} | wachtwoord: ${pw} | rol: ${a.role} | passen: ${a.members.length}`);
  }
  console.log(`\n=== DEMO-ACCOUNTS (eenmalig getoond) ===\n${lines.join("\n")}\n===\n`);
}

async function main() {
  const mode = process.env.SEED_DEMO;
  if (!mode || !process.env.DATABASE_URL) return;
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") return;
  if (mode === "remove") return remove();
  if (mode === "reset") await remove();
  if (mode === "true" || mode === "reset") return create();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
