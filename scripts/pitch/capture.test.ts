/**
 * Legt alle schermen van HHC ClubSupport vast voor de pitch (scripts/pitch/build.mjs maakt daarna de pdf).
 * Draait tegen de lokale testdatabase met uitsluitend verzonnen gegevens. Uitvoer: SHOT_DIR (standaard pitch-out/shots).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright-core";

const PORT = 3110;
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.SHOT_DIR ?? path.resolve("pitch-out/shots");
const PW = "een-lang-wachtwoord-1";
let server: ChildProcess;
let browser: Browser;
const tok: Record<string, string> = {};

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
  const { tokenOf } = await import("../../tests/helpers");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(PW);
  const staff = async (id: string, name: string, role: string, twoFactor = false) => {
    await db.insert(schema.user).values({ id, name, email: `${id}@voorbeeld.test`, role, emailVerified: true, twoFactorEnabled: twoFactor });
    await ctx.internalAdapter.linkAccount({ userId: id, providerId: "credential", accountId: id, password: hash });
  };
  await staff("adm", "Marieke Admin", "sysadmin");
  await staff("scn1", "Karin Controleur", "scanner");
  await staff("scn2", "Henk Poortwachter", "scanner");
  await staff("mgr", "Ruud Ledenbeheer", "manager");
  const member = async (nr: string, name: string, email: string | null) => {
    const r = await acc.createMemberWithPass("adm", { memberNumber: nr, fullName: name, email, confirmLinkExisting: true });
    if (email) {
      const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
      if (u && !(await db.select().from(schema.authAccount).where(eq(schema.authAccount.userId, u.id))).length) {
        await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, u.id));
        await ctx.internalAdapter.linkAccount({ userId: u.id, providerId: "credential", accountId: u.id, password: hash });
      }
    }
    return r;
  };
  const rows: [string, string, string | null][] = [
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
  ];
  const ids: Record<string, string> = {};
  for (const [nr, name, email] of rows) ids[nr] = (await member(nr, name, email)).memberId as string;
  const passOf = async (nr: string) => (await db.select().from(schema.pass).where(eq(schema.pass.memberId, ids[nr])))[0];
  for (const nr of Object.keys(ids)) tok[nr] = (await tokenOf((await passOf(nr)).id))!;
  await passes.deactivatePass((await passOf("1008")).id, "mgr", "Contributie niet voldaan (handmatig besloten)");
  await passes.revokePass((await passOf("1012")).id, "mgr", "lost", "Pas kwijt, nieuwe pas aangevraagd");
  await passes.reissuePass(ids["1012"], "mgr", "lost", "Nieuwe pas");
  tok["1012"] = (await tokenOf((await db.select().from(schema.pass).where(eq(schema.pass.memberId, ids["1012"]))).find((p) => p.status === "active")!.id))!;
  // controles voor het logboek
  for (const [who, nr] of [["scn1", "1001"], ["scn1", "1002"], ["scn1", "1005"], ["scn2", "1006"], ["scn2", "1008"], ["scn1", "1009"], ["scn2", "1010"]] as const) await passes.scanToken(tok[nr], who);
  await passes.scanToken("A".repeat(43), "scn1");
  await passes.lookupMembers("jans", "scn2");
  await passes.lookupMembers("1007", "scn1");

  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, APP_URL: BASE, BETTER_AUTH_URL: BASE, EMAIL_MODE: "disabled" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
}, 180000);

afterAll(async () => {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
});

const resetLimits = async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`truncate rate_limit`);
};
const snap = (page: Page, name: string, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
async function login(ctx: BrowserContext, area: "ledenpas" | "scanner" | "beheer", email: string) {
  await resetLimits();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${area}/inloggen`);
  await page.waitForSelector("#email");
  return { page, submit: async () => {
    await page.fill("#email", email);
    await page.fill("#password", PW);
    await page.click("button:has-text('Inloggen')");
    if (area === "beheer") {
      // MFA-status pas na de login zetten (sessie blijft geldig), zoals in de e2e-tests
      await page.waitForURL((u) => !u.pathname.endsWith("/inloggen"), { timeout: 30000 });
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

describe("pitch-opnames", () => {
  it("ledenpas", async () => {
    const ctx = await browser.newContext(phone);
    const { page, submit } = await login(ctx, "ledenpas", "pieter@voorbeeld.test");
    await snap(page, "ledenpas-inloggen");
    await submit();
    await snap(page, "ledenpas-een-pas");
    // opslaan als afbeelding
    await page.evaluate(() => { (navigator as unknown as { canShare?: unknown }).canShare = undefined; });
    const ctx2 = await browser.newContext({ ...phone, acceptDownloads: true });
    await ctx.close();
    await resetLimits();
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/ledenpas/inloggen`);
    await p2.fill("#email", "pieter@voorbeeld.test"); await p2.fill("#password", PW);
    await p2.click("button:has-text('Inloggen')"); await p2.waitForURL("**/ledenpas");
    await p2.evaluate(() => { (navigator as unknown as { canShare?: unknown }).canShare = undefined; });
    const [dl] = await Promise.all([p2.waitForEvent("download"), p2.getByRole("button", { name: "Pas bewaren als afbeelding" }).click()]);
    await dl.saveAs(path.join(OUT, "pas-afbeelding.png"));
    // offline kopie-aanduiding
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
    await ctx3.close();
    const ctx4 = await browser.newContext(phone);
    const w = await login(ctx4, "ledenpas", "pieter@voorbeeld.test");
    await w.page.goto(`${BASE}/wachtwoord-vergeten`);
    await snap(w.page, "wachtwoord-vergeten");
    await ctx4.close();
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
    await page.fill("#code", tok["1001"]);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=GELDIG");
    await snap(page, "scanner-geldig");
    await page.click("button:has-text('Volgende scan')");
    await page.fill("#code", tok["1008"]);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=Pas gedeactiveerd");
    await snap(page, "scanner-gedeactiveerd");
    await page.click("button:has-text('Volgende scan')");
    await page.fill("#code", "B".repeat(43));
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=Onbekende code");
    await snap(page, "scanner-onbekend");
    await page.click("button:has-text('Volgende scan')");
    await page.route("**/api/scan", (r) => r.abort("internetdisconnected"));
    await page.fill("#code", tok["1001"]);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
    await snap(page, "scanner-offline");
    await page.unroute("**/api/scan");
    await page.reload(); // camera uit, schoon beginscherm
    await page.fill("#q", "jans");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("li:has-text('Jansen')");
    await page.locator("#q").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.querySelector("#q")!.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(400);
    await snap(page, "scanner-zoeken");
    await ctx.close();
  });

  it("beheer", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    const { page, submit } = await login(ctx, "beheer", "adm@voorbeeld.test");
    await snap(page, "beheer-inloggen", true);
    await submit();
    await snap(page, "beheer-overzicht", true);
    await page.goto(`${BASE}/beheer/leden`); await snap(page, "beheer-leden", true);
    await page.click("a:has-text('Jansen')").catch(() => undefined);
    await page.goto(`${BASE}/beheer/leden?q=jansen`);
    await snap(page, "beheer-leden-zoek", true);
    const href = await page.locator("a[href^='/beheer/leden/']").filter({ hasNotText: "Nieuw" }).first().getAttribute("href");
    if (href) { await page.goto(`${BASE}${href}`); await snap(page, "beheer-lid", true); }
    await page.goto(`${BASE}/beheer/leden/nieuw`); await snap(page, "beheer-nieuw-lid", true);
    // import met voorbeeldbestand
    await page.goto(`${BASE}/beheer/import`);
    const csv = "lidnummer;naam;email\n2001;Nora Veldman;nora@voorbeeld.test\n2002;Gerrit Peters;peters@voorbeeld.test\n2003;Ilse Peters;peters@voorbeeld.test\n2004;;geen-naam@voorbeeld.test\n1001;Pieter de Vries;pieter@voorbeeld.test\n";
    const f = path.join(OUT, "voorbeeld.csv"); writeFileSync(f, csv);
    await page.setInputFiles("#file", f);
    await page.click("button:has-text('Preview')").catch(async () => { await page.click("form button"); });
    await page.waitForURL("**/beheer/import?batch=*", { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await snap(page, "beheer-import-preview", true);
    await page.goto(`${BASE}/beheer/controlelogboek`); await snap(page, "beheer-controles", true);
    await page.locator(".chip").nth(1).click(); await page.waitForTimeout(500);
    await snap(page, "beheer-controles-controleur", true);
    await page.goto(`${BASE}/beheer/audit`); await snap(page, "beheer-audit", true);
    await page.goto(`${BASE}/beheer/accounts`); await snap(page, "beheer-accounts", true);
    const state = await ctx.storageState();
    await ctx.close();
    const m = await browser.newContext({ ...phone, storageState: state });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/beheer/leden`);
    await mp.waitForTimeout(800);
    await snap(mp, "beheer-leden-mobiel", false);
    await mp.goto(`${BASE}/beheer/controlelogboek`);
    await snap(mp, "beheer-controles-mobiel", false);
    await m.close();
  });
});
