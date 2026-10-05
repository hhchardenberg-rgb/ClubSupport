import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset } from "./helpers";

const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/server/email/provider", () => ({
  sendMail: async (to: string, mail: { subject: string; text: string }) => {
    sent.push({ to, subject: mail.subject, text: mail.text });
    return { ok: true, ref: "ref-" + sent.length };
  },
}));

beforeEach(async () => {
  await reset();
  sent.length = 0;
});

const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1];

describe("uitnodiging, activatie en reset (tests 13, 14)", () => {
  it("outbox verstuurt na commit; link-token wordt alleen gehasht opgeslagen; eenmalig gebruik", async () => {
    const { db, schema } = await import("@/db");
    const acc = await import("@/server/accounts");
    const { processOutbox } = await import("@/server/email/outbox");
    const { setPasswordWithToken, isLinkUsable } = await import("@/server/activation");
    const admin = await makeUser("admin1", "manager");
    const r = await acc.createMemberWithPass(admin, { memberNumber: "1", fullName: "Eva", email: "eva@example.test" });
    expect(sent).toHaveLength(0); // niets vóór verwerking van de outbox
    expect(await processOutbox()).toEqual({ sent: 1, failed: 0 });
    expect(await processOutbox()).toEqual({ sent: 0, failed: 0 }); // geen dubbele mail
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("eva@example.test");
    expect(sent[0].text).not.toMatch(/wachtwoord:/i);
    const token = tokenFrom(sent[0].text);
    const rows = await db.select().from(schema.accountToken);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0].expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);

    expect(await isLinkUsable(token, "activation")).toBe(true);
    expect(await isLinkUsable(token, "reset")).toBe(false); // verkeerd doel
    expect(await setPasswordWithToken(token, "kort", "activation")).toMatchObject({ ok: false });
    expect(await isLinkUsable(token, "activation")).toBe(true); // zwak wachtwoord verbrandt de link niet
    expect(await setPasswordWithToken(token, "een-lang-wachtwoord-123", "activation")).toEqual({ ok: true });
    expect((await db.select().from(schema.user).where(eq(schema.user.id, r.userId!)))[0].emailVerified).toBe(true);
    expect(await setPasswordWithToken(token, "een-ander-wachtwoord-456", "activation")).toMatchObject({ ok: false }); // eenmalig
    const creds = await db.select().from(schema.authAccount).where(eq(schema.authAccount.userId, r.userId!));
    expect(creds).toHaveLength(1);
    expect(creds[0].password).not.toContain("een-lang-wachtwoord"); // gehasht door Better Auth
  });

  it("verlopen link werkt niet", async () => {
    const { db, schema } = await import("@/db");
    const { createLinkToken } = await import("@/server/email/outbox");
    const { setPasswordWithToken } = await import("@/server/activation");
    const uid = await makeUser("u1", "member");
    const t = await createLinkToken(uid, "activation", 60_000);
    await db.update(schema.accountToken).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await setPasswordWithToken(t, "een-lang-wachtwoord-123", "activation")).toMatchObject({ ok: false });
  });

  it("wachtwoordherstel: generiek voor onbekend adres, geen mail; wel mail voor actief account; sessies ingetrokken; nooit een wachtwoord", async () => {
    const { db, schema } = await import("@/db");
    const { requestPasswordReset, processOutbox } = await import("@/server/email/outbox");
    const { setPasswordWithToken } = await import("@/server/activation");
    const uid = await makeUser("u1", "member");
    const ctx = await (await import("@/lib/auth")).auth.$context;
    await ctx.internalAdapter.linkAccount({ userId: uid, providerId: "credential", accountId: uid, password: await ctx.password.hash("oud-wachtwoord-12345") });
    await db.insert(schema.session).values({ id: "s1", userId: uid, token: "t1", expiresAt: new Date(Date.now() + 1e6) });

    await requestPasswordReset("bestaat-niet@example.test");
    await processOutbox();
    expect(sent).toHaveLength(0);

    await requestPasswordReset("U1@example.test");
    await processOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain("oud-wachtwoord");
    const t = tokenFrom(sent[0].text);
    expect(await setPasswordWithToken(t, "nieuw-wachtwoord-12345", "reset")).toEqual({ ok: true });
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, uid))).toHaveLength(0);
    expect(await setPasswordWithToken(t, "nog-een-wachtwoord-12345", "reset")).toMatchObject({ ok: false });
  });

  it("niet-geactiveerd account krijgt geen resetmail; geactiveerd account krijgt nooit een nieuwe activatiecode", async () => {
    const { db, schema } = await import("@/db");
    const { requestPasswordReset, resendInvitation } = await import("@/server/email/outbox");
    const uid = await makeUser("u2", "member");
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, uid));
    await requestPasswordReset("u2@example.test");
    expect(await db.select().from(schema.emailOutbox)).toHaveLength(0);
    await resendInvitation(uid, null); // niet geactiveerd → mag
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, uid));
    await expect(resendInvitation(uid, null)).rejects.toThrow("already_active");
  });
});
