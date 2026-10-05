import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, devices, type Browser } from "playwright-core";
import path from "node:path";

const PORT = 3102;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOT_DIR ?? "";
let server: ChildProcess;
let browser: Browser;
let token = "";
let passId = "";

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.TOKEN_HMAC_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.TOKEN_ENC_KEY ??= Buffer.alloc(32, 9).toString("base64");

beforeAll(async () => {
  const { db, schema } = await import("@/db");
  const { auth } = await import("@/lib/auth");
  const { makeMember, tokenOf } = await import("../tests/helpers");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash("een-lang-wachtwoord-1");
  await db.insert(schema.user).values({ id: "scn", name: "Sam Scanner", email: "scn@example.test", role: "scanner", emailVerified: true });
  await ctx.internalAdapter.linkAccount({ userId: "scn", providerId: "credential", accountId: "scn", password: hash });
  const m = await makeMember(21, "Anna");
  passId = m.passId;
  token = (await tokenOf(passId))!;
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, APP_URL: BASE, BETTER_AUTH_URL: BASE, EMAIL_MODE: "disabled" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
}, 120000);

afterAll(async () => {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
});

async function resetLoginLimit() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`truncate rate_limit`); // de inlogbegrenzing werkt; tests loggen vaak in vanaf hetzelfde IP
}

async function scannerPage(device: keyof typeof devices | null) {
  await resetLoginLimit();
  const ctx = await browser.newContext(device ? { ...devices[device] } : { viewport: { width: 390, height: 844 } });
  if (!device) await ctx.grantPermissions(["camera"], { origin: BASE });
  else await ctx.grantPermissions(["camera"], { origin: BASE });
  const page = await ctx.newPage();
  const csp: string[] = [];
  page.on("console", (m) => /Content Security Policy/.test(m.text()) && csp.push(m.text()));
  await page.goto(`${BASE}/scanner/inloggen`);
  await page.fill("#email", "scn@example.test");
  await page.fill("#password", "een-lang-wachtwoord-1");
  await page.click("button:has-text('Inloggen')");
  await page.waitForURL("**/scanner", { timeout: 20000 });
  return { ctx, page, csp };
}

const shot = async (page: import("playwright-core").Page, name: string) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: true });

describe("Scanner in de browser (tests 2, 8, 15 voor zover in Chromium-emulatie)", () => {
  it("camera start pas na tik en stopt na het resultaat; handmatige invoer toont GELDIG met naam en lidnummer", async () => {
    const { ctx, page, csp } = await scannerPage("Pixel 5");
    expect(await page.locator("video").count(), "geen camera vóór de tik").toBe(0);
    await page.click("button:has-text('Scan starten')");
    await page.waitForSelector("video", { timeout: 15000 });
    expect(await page.locator("video").count()).toBeGreaterThan(0);
    await shot(page, "scanner-camera");
    await page.fill("#code", token);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=GELDIG");
    expect(await page.locator("section[role=alert]").innerText()).toContain("Anna 21");
    expect(await page.locator("section[role=alert]").innerText()).toContain("Lidnummer T21");
    expect(await page.locator("video:visible").count(), "camera gestopt na resultaat").toBe(0);
    await shot(page, "scanner-geldig");
    expect(csp).toEqual([]);
    await ctx.close();
  });

  it("gedeactiveerd en onbekend: ONGELDIG met aparte meldingen", async () => {
    const { deactivatePass, reactivatePass } = await import("@/server/passes");
    const { ctx, page } = await scannerPage("iPhone 13");
    await deactivatePass(passId, "scn", "test");
    await page.fill("#code", token);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=Pas gedeactiveerd");
    expect(await page.locator("section[role=alert]").innerText()).toContain("ONGELDIG");
    await shot(page, "scanner-gedeactiveerd");
    await page.click("button:has-text('Volgende scan')");
    await page.fill("#code", "A".repeat(43));
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=Onbekende code");
    expect(await page.locator("section[role=alert]").innerText()).toContain("ONGELDIG");
    expect(await page.locator("section[role=alert]").innerText()).not.toContain("Anna");
    await shot(page, "scanner-onbekend");
    await reactivatePass(passId, "scn", "herstel");
    await ctx.close();
  });

  it("zonder verbinding: NIET GECONTROLEERD, nooit GELDIG", async () => {
    const { ctx, page } = await scannerPage("Pixel 5");
    await ctx.setOffline(true);
    await page.waitForSelector("text=Geen verbinding");
    expect(await page.locator("button:has-text('Scan starten')").isDisabled()).toBe(true);
    // Ook als er toch een verzoek wordt gedaan (bijv. verbinding valt weg tijdens controle):
    await ctx.setOffline(false);
    await page.route("**/api/scan", (r) => r.abort("internetdisconnected"));
    await page.fill("#code", token);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
    expect(await page.locator("section[role=alert]").innerText()).toContain("Verbinding nodig");
    expect(await page.locator("section[role=alert] h1").innerText()).toBe("NIET GECONTROLEERD");
    await shot(page, "scanner-offline");
    // Serverfout (500) en rommelantwoord → ook nooit geldig
    await page.unroute("**/api/scan");
    await page.route("**/api/scan", (r) => r.fulfill({ status: 500, body: "{}" }));
    await page.click("button:has-text('Volgende scan')").catch(() => undefined);
    await page.fill("#code", token);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
    await page.unroute("**/api/scan");
    await page.route("**/api/scan", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>valid</html>" }));
    await page.click("button:has-text('Volgende scan')").catch(() => undefined);
    await page.fill("#code", token);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
    expect(await page.locator("section[role=alert] h1").innerText()).not.toBe("GELDIG");
    await ctx.close();
  });

  it("cameratoestemming geweigerd: duidelijke melding en handmatige invoer blijft werken", async () => {
    const ctx = await (await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--deny-permission-prompts"] })).newContext({ ...devices["Pixel 5"] });
    const page = await ctx.newPage();
    await resetLoginLimit();
    await page.goto(`${BASE}/scanner/inloggen`);
    await page.fill("#email", "scn@example.test");
    await page.fill("#password", "een-lang-wachtwoord-1");
    await page.click("button:has-text('Inloggen')");
    await page.waitForURL("**/scanner");
    await page.click("button:has-text('Scan starten')");
    await page.waitForSelector("[role=alert]:has-text('camera')", { timeout: 15000 });
    await page.fill("#code", token);
    await page.click("button:has-text('Controleren')");
    await page.waitForSelector("text=GELDIG");
    await ctx.close();
  });

  it("PWA: aparte manifesten, iconen bereikbaar, service worker registreert zonder API's te cachen", async () => {
    const s = await (await fetch(`${BASE}/scanner/manifest.webmanifest`)).json();
    const l = await (await fetch(`${BASE}/ledenpas/manifest.webmanifest`)).json();
    expect(s).toMatchObject({ short_name: "Scanner", start_url: "/scanner", scope: "/scanner", display: "standalone" });
    expect(l).toMatchObject({ short_name: "Ledenpas", start_url: "/ledenpas", scope: "/ledenpas", display: "standalone" });
    expect(s.name).not.toBe(l.name);
    for (const i of [...s.icons, ...l.icons]) expect((await fetch(BASE + i.src)).status, i.src).toBe(200);
    const { ctx, page } = await scannerPage("Pixel 5");
    await page.evaluate(() => navigator.serviceWorker.ready);
    const src = await (await fetch(`${BASE}/sw-scanner.js`)).text();
    expect(src).toMatch(/\/api\/.*return/s);
    expect(src).not.toMatch(/\/api\/scan.*cache/s);
    await ctx.close();
  });
});
