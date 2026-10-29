/**
 * Legt alle schermen van HHC ClubSupport vast voor de handleiding (scripts/handleiding/build.mjs maakt daarna de pdf).
 * Draait tegen de lokale testdatabase met uitsluitend verzonnen gegevens. Uitvoer: SHOT_DIR (standaard handleiding-out/shots).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright-core";

const PORT = 3120;
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.SHOT_DIR ?? path.resolve("handleiding-out/shots");
const PW = "een-lang-wachtwoord-1";
let server: ChildProcess;
let browser: Browser;
const tok: Record<string, string> = {};
const ids: Record<string, string> = {};
const links: Record<string, string> = {};

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.TOKEN_HMAC_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.TOKEN_ENC_KEY ??= Buffer.alloc(32, 9).toString("base64");

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  const { reset } = await import("../../tests/helpers");
  await reset();
  const { db, schema } = await import("@/db");
  const { auth } = await import("@/lib/auth");
  const { eq } = await import("drizzle-orm");
  const acc = await import("@/server/accounts");
  const passes = await import("@/server/passes");
  const ms = await import("@/server/memberships");
  const sec = await import("@/server/security");
  const nl = await import("@/server/newsletter");
  const reqs = await import("@/server/requests");
  const { createLinkToken } = await import("@/server/email/outbox");
  const { tokenOf } = await import("../../tests/helpers");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(PW);
  const staff = async (id: string, name: string, role: string) => {
    await db.insert(schema.user).values({ id, name, email: `${id}@voorbeeld.test`, role, emailVerified: true, twoFactorEnabled: false });
    await ctx.internalAdapter.linkAccount({ userId: id, providerId: "credential", accountId: id, password: hash });
  };
  await staff("adm", "Marieke Admin", "sysadmin");
  await staff("scn1", "Karin Controleur", "scanner");
  await staff("scn2", "Henk Poortwachter", "scanner");
  await staff("mgr", "Ruud Ledenbeheer", "manager");
  await staff("mgr2", "Linda Ledenadministratie", "manager");
  const member = async (nr: string, name: string, email: string | null, activated = true) => {
    const r = await acc.createMemberWithPass("adm", { memberNumber: nr, fullName: name, email, confirmLinkExisting: true });
    if (email && activated) {
      const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
      if (u && !(await db.select().from(schema.authAccount).where(eq(schema.authAccount.userId, u.id))).length) {
        await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, u.id));
        await ctx.internalAdapter.linkAccount({ userId: u.id, providerId: "credential", accountId: u.id, password: hash });
      }
    }
    return r;
  };
  const rows: [string, string, string | null, boolean?][] = [
    ["1001", "Pieter de Vries", "pieter@voorbeeld.test"],
    ["1002", "Daan Jansen", "familie.jansen@voorbeeld.test"],
    ["1003", "Sanne Jansen", "familie.jansen@voorbeeld.test"],
    ["1004", "Lars Jansen", "familie.jansen@voorbeeld.test"],
    ["1005", "Fatima El Amrani", "fatima@voorbeeld.test"],
    ["1006", "Bert Bosman", "bert@voorbeeld.test"],
    ["1007", "Anneke Visser", "anneke@voorbeeld.test"],
    ["1008", "Jeroen Smit", "jeroen@voorbeeld.test"],
    ["1009", "Marloes Dijkstra", "marloes@voorbeeld.test"],
    ["1010", "Kees Mulder", "kees@voorbeeld.test"],
    ["1011", "Els van der Berg", "els@voorbeeld.test"],
    ["1012", "Tom Hoekstra", "tom@voorbeeld.test"],
    ["1013", "Wim Brouwer", "wim@voorbeeld.test"],
    ["1014", "Yara Postma", "yara@voorbeeld.test"],
    ["1015", "Nina Kuipers", "nina@voorbeeld.test", false],
  ];
  for (const [nr, name, email, activated] of rows) ids[nr] = (await member(nr, name, email, activated ?? true)).memberId as string;
  const passOf = async (nr: string) => (await db.select().from(schema.pass).where(eq(schema.pass.memberId, ids[nr])))[0];
  for (const nr of Object.keys(ids)) tok[nr] = (await tokenOf((await passOf(nr)).id))!;
  await passes.deactivatePass((await passOf("1008")).id, "mgr", "Contributie niet voldaan (handmatig besloten)");
  await passes.revokePass((await passOf("1012")).id, "mgr", "lost", "Pas kwijt, nieuwe pas aangevraagd");
  await passes.reissuePass(ids["1012"], "mgr", "lost", "Nieuwe pas");
  tok["1012"] = (await tokenOf((await db.select().from(schema.pass).where(eq(schema.pass.memberId, ids["1012"]))).find((p) => p.status === "active")!.id))!;
  // lidmaatschappen: schorsing, einde (oud-lid), verlopen en gearchiveerd
  await ms.changeMembership("mgr", ids["1007"], "suspend", { reason: "Betaling uitgebleven (intern)" });
  await ms.changeMembership("mgr", ids["1009"], "end", { endDate: "2026-06-30", reason: "Opgezegd per einde seizoen" });
  await ms.changeMembership("mgr", ids["1010"], "update", { endDate: "2026-08-31" });
  await ms.changeMembership("mgr", ids["1013"], "update", { startDate: "2025-08-01", endDate: "2027-06-30" });
  await ms.archiveMember(ids["1011"], "mgr", "Dubbel ingevoerd, bewaard voor de administratie");
  // controles voor het logboek
  for (const [who, nr] of [["scn1", "1001"], ["scn1", "1002"], ["scn1", "1005"], ["scn2", "1006"], ["scn2", "1008"], ["scn1", "1009"], ["scn2", "1010"], ["scn1", "1013"], ["scn2", "1007"]] as const) await passes.scanToken(tok[nr], who);
  await passes.scanToken("A".repeat(43), "scn1");
  await passes.lookupMembers("jans", "scn2");
  await passes.lookupMembers("1007", "scn1");
  // beveiligingsmeldingen (zonder mail)
  const [pieter] = await db.select().from(schema.user).where(eq(schema.user.email, "pieter@voorbeeld.test"));
  await sec.raiseSecurityEvent({ type: "login_failures", userId: pieter.id, dedupe: "doc-1", details: { count: 5 } });
  await sec.raiseSecurityEvent({ type: "scan_guessing", severity: "critical", userId: "scn1", dedupe: "doc-2", details: { count: 11 } });
  await sec.raiseSecurityEvent({ type: "passkey_added", severity: "info", userId: "adm", dedupe: "doc-3" });
  await sec.raiseSecurityEvent({ type: "export_off_hours", userId: "mgr", dedupe: "doc-4" });
  // wijzigingsverzoeken van een gezin
  const [jansen] = await db.select().from(schema.user).where(eq(schema.user.email, "familie.jansen@voorbeeld.test"));
  await reqs.createChangeRequest(jansen.id, ids["1003"], "details", { fullName: "Sanne Jansen-de Boer", email: "sanne.jansen@voorbeeld.test", note: "Naamswijziging na huwelijk" });
  await reqs.createChangeRequest(jansen.id, ids["1004"], "cancellation", { endDate: "2026-12-31", note: "Verhuisd naar het buitenland" });
  const [pieterReq] = [pieter];
  await reqs.createChangeRequest(pieterReq.id, ids["1001"], "details", { email: "pieter.devries@voorbeeld.test" });
  // nieuwsbrieven: één verzonden, één gepland, één concept
  const sentId = await nl.createNewsletter("mgr2", { subject: "Seizoensopening: alles over de eerste thuiswedstrijd", body: "Beste supporter,\n\nZaterdag openen we het seizoen thuis tegen een mooie tegenstander.\n\n## Praktisch\n- Poorten open om 18.30 uur\n- Neem je Ledenpas mee op je telefoon\n\nTot zaterdag!", audience: "members" });
  await nl.queueNewsletter("mgr2", sentId, { confirm: true, expectedCount: null });
  await db.update(schema.newsletterDelivery).set({ status: "sent", sentAt: new Date() }).where(eq(schema.newsletterDelivery.newsletterId, sentId));
  await db.update(schema.newsletter).set({ status: "sent", sentAt: new Date() }).where(eq(schema.newsletter.id, sentId));
  const planId = await nl.createNewsletter("mgr2", { subject: "Terugblik op de maand: foto's en uitslagen", body: "Beste supporter,\n\nHier alvast een korte terugblik.\n\n**Uitslagen**\n- Thuis: 3-1 winst\n- Uit: gelijkspel", audience: "everyone" });
  const nextWeek = new Date(Date.now() + 5 * 86400000);
  await nl.scheduleNewsletter("mgr2", planId, `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}T10:00`, true);
  ids.concept = await nl.createNewsletter("mgr2", { subject: "Bedankt oud-leden: kom terug met korting", body: "Beste oud-lid,\n\nWe missen je op de tribune. Meld je opnieuw aan en zit weer bij de club.\n\n_Het bestuur_", audience: "former" });
  ids.sent = sentId;
  ids.plan = planId;
  // links voor activeren en wachtwoord resetten
  const [nina] = await db.select().from(schema.user).where(eq(schema.user.email, "nina@voorbeeld.test"));
  links.activate = `${BASE}/activeren?token=${await createLinkToken(nina.id, "activation", 3600_000)}`;
  const [fatima] = await db.select().from(schema.user).where(eq(schema.user.email, "fatima@voorbeeld.test"));
  links.reset = `${BASE}/wachtwoord-resetten?token=${await createLinkToken(fatima.id, "reset", 3600_000)}`;

  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, APP_URL: BASE, BETTER_AUTH_URL: BASE, EMAIL_MODE: "live" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
}, 240000);

afterAll(async () => {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
});

const resetLimits = async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`truncate rate_limit, app_rate_limit`);
};
const snap = (page: Page, name: string, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
async function login(ctx: BrowserContext, area: "ledenpas" | "scanner" | "beheer", email: string, mfaFlag = true) {
  await resetLimits();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${area}/inloggen`);
  await page.waitForSelector("#email");
  return { page, submit: async () => {
    await page.fill("#email", email);
    await page.fill("#password", PW);
    await page.click("button:has-text('Inloggen')");
    if (area === "beheer") {
      await page.waitForURL((u) => !u.pathname.endsWith("/inloggen"), { timeout: 30000 }).catch(async (e) => {
        await snap(page, "debug-login");
        throw e;
      });
      if (!mfaFlag) return;
      const { db, schema } = await import("@/db");
      const { eq } = await import("drizzle-orm");
      await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.email, email));
      await page.goto(`${BASE}/beheer`);
    }
    await page.waitForURL(`**/${area}`, { timeout: 30000 });
    await page.waitForTimeout(800);
  } };
}
const phone = { ...devices["iPhone 13"], viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" as const };
const desktop = { viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2, reducedMotion: "reduce" as const };

describe("handleiding-opnames", () => {
  it("ledenpas", async () => {
    const ctx = await browser.newContext(phone);
    const act = await ctx.newPage();
    await act.goto(links.activate);
    await act.waitForTimeout(800);
    await snap(act, "ledenpas-activeren");
    await ctx.close();

    const ctxR = await browser.newContext(phone);
    const rp = await ctxR.newPage();
    await rp.goto(links.reset);
    await rp.waitForTimeout(800);
    await snap(rp, "wachtwoord-resetten");
    await rp.goto(`${BASE}/wachtwoord-vergeten`);
    await rp.waitForTimeout(500);
    await snap(rp, "wachtwoord-vergeten");
    await ctxR.close();

    const ctx1 = await browser.newContext(phone);
    const { page, submit } = await login(ctx1, "ledenpas", "pieter@voorbeeld.test");
    await snap(page, "ledenpas-inloggen");
    await submit();
    await snap(page, "ledenpas-een-pas");
    await snap(page, "ledenpas-een-pas-lang", true);
    await page.goto(`${BASE}/ledenpas/verzoeken`);
    await page.waitForTimeout(600);
    await snap(page, "ledenpas-verzoeken", true);
    await page.goto(`${BASE}/ledenpas/beveiliging`);
    await page.waitForTimeout(800);
    await snap(page, "ledenpas-beveiliging", true);
    await ctx1.close();

    const ctx2 = await browser.newContext({ ...phone, acceptDownloads: true });
    await resetLimits();
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/ledenpas/inloggen`);
    await p2.fill("#email", "pieter@voorbeeld.test"); await p2.fill("#password", PW);
    await p2.click("button:has-text('Inloggen')"); await p2.waitForURL("**/ledenpas");
    await p2.evaluate(() => { (navigator as unknown as { canShare?: unknown }).canShare = undefined; });
    const [dl] = await Promise.all([p2.waitForEvent("download"), p2.getByRole("button", { name: "Pas bewaren als afbeelding" }).click()]);
    await dl.saveAs(path.join(OUT, "pas-afbeelding.png"));
    await p2.waitForTimeout(1500);
    await snap(p2, "ledenpas-offline-aan");
    await p2.goto(`${BASE}/ledenpas/offline`);
    await p2.waitForTimeout(1200);
    await snap(p2, "ledenpas-offline");
    await ctx2.close();

    const ctx3 = await browser.newContext(phone);
    const l = await login(ctx3, "ledenpas", "familie.jansen@voorbeeld.test");
    await l.submit();
    await snap(l.page, "ledenpas-gezin-1");
    await l.page.locator(".arrow").last().click();
    await l.page.waitForTimeout(600);
    await snap(l.page, "ledenpas-gezin-2");
    await l.page.goto(`${BASE}/ledenpas/verzoeken`);
    await l.page.waitForTimeout(600);
    await snap(l.page, "ledenpas-verzoeken-gezin", true);
    await ctx3.close();
  });

  it("scanner", async () => {
    const ctx = await browser.newContext(phone);
    await ctx.grantPermissions(["camera"], { origin: BASE });
    const { page, submit } = await login(ctx, "scanner", "scn1@voorbeeld.test");
    await snap(page, "scanner-inloggen");
    await submit();
    await snap(page, "scanner-start");
    await page.click("button:has-text('Scan starten')");
    await page.waitForSelector("video", { timeout: 15000 });
    await page.waitForTimeout(1500);
    await snap(page, "scanner-camera");
    await page.reload();
    const check = async (code: string, wait: string, name: string) => {
      await page.fill("#code", code);
      await page.click("button:has-text('Controleren')");
      await page.waitForSelector(`text=${wait}`);
      await snap(page, name);
      await page.click("button:has-text('Volgende scan')");
    };
    await check(tok["1001"], "GELDIG", "scanner-geldig");
    await check(tok["1008"], "Pas gedeactiveerd", "scanner-gedeactiveerd");
    await check(tok["1009"], "Lidmaatschap", "scanner-lidmaatschap");
    await check("B".repeat(43), "Onbekende code", "scanner-onbekend");
    await page.route("**/api/scan", (r) => r.abort("internetdisconnected"));
    await page.fill("#code", tok["1001"]);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
    await snap(page, "scanner-offline");
    await page.unroute("**/api/scan");
    await page.reload();
    await page.fill("#q", "jans");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("li:has-text('Jansen')");
    await page.evaluate(() => window.scrollTo(0, document.querySelector("#q")!.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(400);
    await snap(page, "scanner-zoeken");
    await page.goto(`${BASE}/scanner/beveiliging`);
    await page.waitForTimeout(800);
    await snap(page, "scanner-beveiliging", true);
    await ctx.close();
  });

  it("beheer", async () => {
    // eerste keer inloggen zonder tweestapsverificatie: MFA instellen
    const mctx = await browser.newContext(desktop);
    const m = await login(mctx, "beheer", "mgr@voorbeeld.test");
    await snap(m.page, "beheer-inloggen", true);
    await m.page.fill("#email", "mgr@voorbeeld.test");
    await m.page.fill("#password", PW);
    await m.page.click("button:has-text('Inloggen')");
    await m.page.waitForURL("**/beheer/mfa-instellen", { timeout: 30000 });
    await m.page.waitForTimeout(600);
    await snap(m.page, "beheer-mfa-instellen", true);
    await m.page.fill("#password", PW).catch(() => undefined);
    await m.page.click("button:has-text('Doorgaan')").catch(() => undefined);
    await m.page.waitForSelector("img[alt='QR-code om MFA in te stellen']", { timeout: 15000 }).catch(() => undefined);
    await m.page.waitForTimeout(500);
    await snap(m.page, "beheer-mfa-qr", true);
    await mctx.close();

    const ctx = await browser.newContext(desktop);
    const { page, submit } = await login(ctx, "beheer", "adm@voorbeeld.test");
    await submit();
    await snap(page, "beheer-overzicht", true);
    await page.click("button.menu-toggle");
    await page.waitForTimeout(300);
    await snap(page, "beheer-menu");
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}/beheer/leden`); await snap(page, "beheer-leden", true);
    await page.goto(`${BASE}/beheer/leden?q=jansen`); await snap(page, "beheer-leden-zoek", true);
    const memberHref = async (nr: string) => `/beheer/leden/${ids[nr]}`;
    await page.goto(`${BASE}${await memberHref("1001")}`); await snap(page, "beheer-lid", true);
    await page.goto(`${BASE}${await memberHref("1009")}`); await snap(page, "beheer-lid-oudlid", true);
    await page.goto(`${BASE}/beheer/leden/nieuw`); await snap(page, "beheer-nieuw-lid", true);
    await page.goto(`${BASE}/beheer/ledenaccounts`); await snap(page, "beheer-koppelingen", true);
    // import met eigen kolomnamen
    await page.goto(`${BASE}/beheer/import`);
    await snap(page, "beheer-import", true);
    const csv = "Lidnr;Volledige naam;Mail;Lidmaatschap\n2001;Nora Veldman;nora@voorbeeld.test;actief\n2002;Gerrit Peters;peters@voorbeeld.test;actief\n2003;Ilse Peters;peters@voorbeeld.test;actief\n2004;;geen-naam@voorbeeld.test;actief\n1001;Pieter de Vries;pieter@voorbeeld.test;actief\n";
    const f = path.join(OUT, "voorbeeld.csv"); writeFileSync(f, csv);
    await page.setInputFiles("#file", f);
    await page.click("button:has-text('Verder naar kolomkoppeling')");
    await page.waitForSelector("text=2. Kolommen koppelen");
    await page.selectOption("#col0", "memberNumber");
    await page.selectOption("#col1", "fullName");
    await page.selectOption("#col2", "email");
    await snap(page, "beheer-import-koppelen", true);
    await page.click("button:has-text('Voorbeeld tonen')");
    await page.waitForSelector("text=3. Voorbeeld");
    await page.waitForTimeout(500);
    await snap(page, "beheer-import-preview", true);
    await page.goto(`${BASE}/beheer/verzoeken`); await snap(page, "beheer-verzoeken", true);
    await page.goto(`${BASE}/beheer/nieuwsbrieven`); await snap(page, "beheer-nieuwsbrieven", true);
    await page.goto(`${BASE}/beheer/nieuwsbrieven/nieuw`); await snap(page, "beheer-nieuwsbrief-nieuw", true);
    await page.goto(`${BASE}/beheer/nieuwsbrieven/${ids.concept}`); await snap(page, "beheer-nieuwsbrief-concept", true);
    await page.goto(`${BASE}/beheer/nieuwsbrieven/${ids.plan}`); await snap(page, "beheer-nieuwsbrief-gepland", true);
    await page.goto(`${BASE}/beheer/nieuwsbrieven/${ids.sent}`); await snap(page, "beheer-nieuwsbrief-verzonden", true);
    await page.goto(`${BASE}/beheer/controlelogboek`); await snap(page, "beheer-controles", true);
    await page.locator(".chip").nth(1).click(); await page.waitForTimeout(500);
    await snap(page, "beheer-controles-controleur", true);
    await page.goto(`${BASE}/beheer/audit`); await snap(page, "beheer-audit", true);
    await page.goto(`${BASE}/beheer/accounts`); await snap(page, "beheer-accounts", true);
    await page.goto(`${BASE}/beheer/meldingen`); await snap(page, "beheer-meldingen", true);
    await page.goto(`${BASE}/beheer/beveiliging`); await page.waitForTimeout(800); await snap(page, "beheer-beveiliging", true);
    const state = await ctx.storageState();
    await ctx.close();
    const mob = await browser.newContext({ ...phone, storageState: state });
    const mp = await mob.newPage();
    await mp.goto(`${BASE}/beheer`);
    await mp.waitForTimeout(800);
    await snap(mp, "beheer-overzicht-mobiel");
    await mp.click("button.menu-toggle");
    await mp.waitForTimeout(300);
    await snap(mp, "beheer-menu-mobiel");
    await mp.keyboard.press("Escape");
    await mp.goto(`${BASE}/beheer/leden`);
    await mp.waitForTimeout(800);
    await snap(mp, "beheer-leden-mobiel");
    await mob.close();
  });
});
