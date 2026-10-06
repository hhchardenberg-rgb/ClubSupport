import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeUser, reset } from "./helpers";

vi.mock("@/server/email/provider", () => ({ sendMail: async () => ({ ok: true, ref: "r" }) }));

beforeEach(async () => {
  await reset();
  delete process.env.PASSWORD_BREACH_CHECK;
});
afterEach(() => vi.unstubAllGlobals());

const sha1 = async (s: string) => (await import("node:crypto")).createHash("sha1").update(s).digest("hex").toUpperCase();

describe("controle op gelekte wachtwoorden (k-anonymity)", () => {
  it("stuurt alleen de eerste 5 tekens van de hash, herkent treffers (ook met padding) en faalt open bij storingen", async () => {
    const { isPasswordPwned } = await import("@/lib/pwned");
    const hash = await sha1("wachtwoord123456");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(`${hash.slice(5)}:42\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n`, { status: 200 });
    });
    expect(await isPasswordPwned("wachtwoord123456")).toBe(true);
    expect(urls[0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(urls[0]).not.toContain(hash.slice(5));
    vi.stubGlobal("fetch", async () => new Response(`${hash.slice(5)}:0\nBBBB:5\n`, { status: 200 })); // alleen padding
    expect(await isPasswordPwned("wachtwoord123456")).toBe(false);
    vi.stubGlobal("fetch", async () => { throw new Error("netwerk"); });
    expect(await isPasswordPwned("x")).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    expect(await isPasswordPwned("x")).toBeNull();
    process.env.PASSWORD_BREACH_CHECK = "off";
    expect(await isPasswordPwned("x")).toBeNull();
  });

  it("een gelekt wachtwoord wordt bij activeren geweigerd zonder de link te verbruiken; een ander wachtwoord werkt", async () => {
    const { createLinkToken } = await import("@/server/email/outbox");
    const { setPasswordWithToken, isLinkUsable } = await import("@/server/activation");
    const { db, schema } = await import("@/db");
    await db.insert(schema.user).values({ id: "nieuw", name: "Nieuw", email: "nieuw@example.test", role: "member", emailVerified: false });
    const token = await createLinkToken("nieuw", "activation", 60_000);
    const bad = await sha1("Gelekt-wachtwoord-1!");
    vi.stubGlobal("fetch", async (url: string) => new Response(String(url).endsWith(bad.slice(0, 5)) ? `${bad.slice(5)}:9999\n` : "", { status: 200 }));
    const r1 = await setPasswordWithToken(token, "Gelekt-wachtwoord-1!", "activation");
    expect(r1).toMatchObject({ ok: false, error: expect.stringMatching(/datalekken/) });
    expect(await isLinkUsable(token, "activation")).toBe(true); // link niet verbruikt
    const r2 = await setPasswordWithToken(token, "Heel-uniek-zinnetje-42-appel", "activation");
    expect(r2.ok).toBe(true);
  });
});

describe("beveiligingsmeldingen bij verdachte activiteit", () => {
  async function setup() {
    await makeUser("sys", "sysadmin");
    await makeUser("lid", "member");
    const { db, schema } = await import("@/db");
    return { db, schema };
  }
  const notices = async () => {
    const { db, schema } = await import("@/db");
    return (await db.select().from(schema.emailOutbox)).filter((o) => o.kind === "notice");
  };

  it("meerdere mislukte logins voor één account: melding + mail aan eigenaar, één keer; onder de drempel niets; geen e-mailadres in de melding", async () => {
    const { db, schema } = await setup();
    const { onLoginFailed } = await import("@/server/security");
    for (let i = 0; i < 4; i++) await onLoginFailed("lid@example.test", "1.2.3.4");
    expect(await db.select().from(schema.securityEvent)).toHaveLength(0);
    await onLoginFailed("lid@example.test", "1.2.3.4");
    await onLoginFailed("lid@example.test", "1.2.3.4"); // zelfde voorval: geen tweede melding
    const ev = await db.select().from(schema.securityEvent);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "login_failures", userId: "lid" });
    expect(JSON.stringify(ev)).not.toContain("lid@example.test");
    expect(JSON.stringify(ev)).not.toContain("1.2.3.4"); // alleen een hash van de herkomst
    const n = await notices();
    expect(n.map((x) => x.userId)).toEqual(["lid"]); // lid: alleen de eigenaar, systeembeheer niet
    expect(JSON.stringify(n[0].payload)).not.toMatch(/wachtwoord"?\s*:\s*"[^"]{12,}/);
  });

  it("staf-account: ook systeembeheer wordt gewaarschuwd; onbekende e-mailadressen leiden pas bij veel pogingen tot een (stille) melding", async () => {
    const { db, schema } = await setup();
    await makeUser("scn", "scanner");
    const { onLoginFailed } = await import("@/server/security");
    for (let i = 0; i < 5; i++) await onLoginFailed("scn@example.test", "5.6.7.8");
    expect((await notices()).map((x) => x.userId).sort()).toEqual(["scn", "sys"]);
    for (let i = 0; i < 14; i++) await onLoginFailed("bestaat-niet@example.test", "9.9.9.9");
    expect((await db.select().from(schema.securityEvent)).filter((e) => e.type === "login_failures_ip")).toHaveLength(0);
    await onLoginFailed("bestaat-niet@example.test", "9.9.9.9");
    expect((await db.select().from(schema.securityEvent)).filter((e) => e.type === "login_failures_ip")).toHaveLength(1);
    expect((await notices())).toHaveLength(2); // geen mail voor onbekende adressen
  });

  it("onjuiste verificatiecodes, veel onbekende scans, veel zoekopdrachten en exports geven een melding aan systeembeheer", async () => {
    const { db, schema } = await setup();
    await makeUser("ctrl", "scanner");
    const sec = await import("@/server/security");
    for (let i = 0; i < 5; i++) await sec.onMfaFailed("4.4.4.4");
    for (let i = 0; i < 10; i++) await sec.onScanSuspect("ctrl");
    for (let i = 0; i < 101; i++) await sec.onLookup("ctrl");
    for (let i = 0; i < 3; i++) await sec.onExport("sys", new Date("2026-07-01T10:00:00Z"));
    await sec.onExport("sys", new Date("2026-07-01T22:30:00Z")); // 00:30 Amsterdamse tijd
    const types = (await db.select().from(schema.securityEvent)).map((e) => e.type).sort();
    expect(types).toEqual(["export_burst", "export_off_hours", "lookup_scraping", "mfa_failures", "scan_guessing"]);
    expect((await notices()).every((n) => n.userId === "sys")).toBe(true);
    expect(await sec.openSecurityCount()).toBe(4); // info telt niet mee in de teller
    const first = (await sec.listSecurityEvents({ open: true }))[0];
    await sec.acknowledgeSecurityEvent("sys", first.id);
    expect(await sec.openSecurityCount()).toBeLessThanOrEqual(4);
    expect((await db.select().from(schema.auditEvent)).some((a) => a.action === "security.acknowledge")).toBe(true);
  });

  it("scantellers: 10 onbekende codes via de echte scanfunctie leveren een melding op", async () => {
    const { db, schema } = await setup();
    await makeUser("ctrl2", "scanner");
    const { scanToken } = await import("@/server/passes");
    for (let i = 0; i < 10; i++) await scanToken("A".repeat(43), "ctrl2");
    expect((await db.select().from(schema.securityEvent)).map((e) => e.type)).toContain("scan_guessing");
  });

  it("geslaagde login met een gelekt wachtwoord: melding aan het account (maandelijks), niets bij een veilig wachtwoord", async () => {
    const { db, schema } = await setup();
    const { onPasswordLogin } = await import("@/server/security");
    vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
    await onPasswordLogin("lid", "veilig-wachtwoord");
    expect(await db.select().from(schema.securityEvent)).toHaveLength(0);
    const h = await sha1("gelekt");
    vi.stubGlobal("fetch", async () => new Response(`${h.slice(5)}:5\n`, { status: 200 }));
    await onPasswordLogin("lid", "gelekt");
    await onPasswordLogin("lid", "gelekt");
    expect(await db.select().from(schema.securityEvent)).toHaveLength(1);
    expect((await notices()).map((n) => n.userId)).toEqual(["lid"]);
  });
});

describe("MFA-herstel door systeembeheer", () => {
  it("reset verwijdert TOTP, herstelcodes en passkeys, beëindigt sessies, waarschuwt iedereen en vereist reden; niet voor jezelf of leden", async () => {
    const { db, schema } = await import("@/db");
    await makeUser("sys", "sysadmin");
    await makeUser("sys2", "sysadmin");
    await makeUser("beheer", "manager");
    await makeUser("lid", "member");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, "beheer"));
    await db.insert(schema.twoFactor).values({ id: "tf1", secret: "x", backupCodes: "y", userId: "beheer" });
    await db.insert(schema.passkey).values({ id: "pk1", publicKey: "k", userId: "beheer", credentialID: "c", counter: 0, deviceType: "singleDevice", backedUp: false });
    await db.insert(schema.session).values({ id: "s1", userId: "beheer", token: "t", expiresAt: new Date(Date.now() + 1e6) });
    const { resetStaffMfa } = await import("@/server/security");
    await expect(resetStaffMfa("sys", "beheer", "ab")).rejects.toThrow("reason_required");
    await expect(resetStaffMfa("sys", "sys", "telefoon kwijt")).rejects.toThrow("self");
    await expect(resetStaffMfa("sys", "lid", "telefoon kwijt")).rejects.toThrow("not_found");
    await resetStaffMfa("sys", "beheer", "telefoon kwijt, identiteit gecontroleerd");
    expect((await db.select().from(schema.user).where(eq(schema.user.id, "beheer")))[0].twoFactorEnabled).toBe(false);
    expect(await db.select().from(schema.twoFactor)).toHaveLength(0);
    expect(await db.select().from(schema.passkey)).toHaveLength(0);
    expect(await db.select().from(schema.session)).toHaveLength(0);
    expect((await db.select().from(schema.auditEvent)).some((a) => a.action === "staff.mfa_reset")).toBe(true);
    const who = (await db.select().from(schema.emailOutbox)).filter((o) => o.kind === "notice").map((o) => o.userId).sort();
    expect(who).toEqual(["beheer", "sys", "sys2"]); // betrokkene + alle systeembeheerders
  });

  it("een passkey telt als tweede factor voor staf; zonder passkey en zonder TOTP niet", async () => {
    const { hasPasskey } = await import("@/lib/session");
    const { db, schema } = await import("@/db");
    await makeUser("pk", "manager");
    expect(await hasPasskey("pk")).toBe(false);
    await db.insert(schema.passkey).values({ id: "pk2", publicKey: "k", userId: "pk", credentialID: "c2", counter: 0, deviceType: "multiDevice", backedUp: true });
    expect(await hasPasskey("pk")).toBe(true);
  });
});
