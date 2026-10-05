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
  // Gezinsaccount met 3 leden voor de carrousel-test
  const acc = await import("@/server/accounts");
  await db.insert(schema.user).values({ id: "adm", name: "adm", email: "adm@example.test", role: "manager", emailVerified: true });
  let famId = "";
  for (const [n, name] of [[31, "Eerste Pas"], [32, "Tweede Pas"], [33, "Derde Pas"]] as const) {
    const r = await acc.createMemberWithPass("adm", { memberNumber: `F${n}`, fullName: name, email: "fam@example.test", confirmLinkExisting: true });
    famId = r.userId!;
  }
  await db.update(schema.user).set({ emailVerified: true }).where((await import("drizzle-orm")).eq(schema.user.id, famId));
  await ctx.internalAdapter.linkAccount({ userId: famId, providerId: "credential", accountId: famId, password: hash });
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

  it("ledenpas: tussen meerdere passen vegen, met pijlen, stippen en toetsenbord", async () => {
    await resetLoginLimit();
    // Verminderde beweging: de carrousel springt dan direct (deterministisch) en dit is het toegankelijkheidspad.
    const ctx = await browser.newContext({ ...devices["Pixel 5"], reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ledenpas/inloggen`);
    await page.fill("#email", "fam@example.test");
    await page.fill("#password", "een-lang-wachtwoord-1");
    await page.click("button:has-text('Inloggen')");
    await page.waitForURL("**/ledenpas");
    const counter = () => page.locator(".counter").innerText();
    expect(await page.locator(".carousel .slide").count()).toBe(3);
    expect(await page.locator(".dot").count()).toBe(3);
    expect(await counter()).toBe("Pas 1 van 3");
    await shot(page, "carrousel-1");

    // echte aanraak-veeg naar links (touchStart → touchMove's → touchEnd) via CDP
    const cdp = await ctx.newCDPSession(page);
    const box = (await page.locator(".carousel").boundingBox())!;
    const y = Math.round(box.y + 150);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 330 + ((60 - 330) * i) / 12, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // De veeg moet de carrousel daadwerkelijk verschuiven (headless Chromium klikt na een gesimuleerde veeg niet altijd vast).
    await page.waitForFunction(() => (document.querySelector(".carousel") as HTMLElement).scrollLeft > 50, null, { timeout: 8000 });
    await shot(page, "carrousel-2");

    // pijlen: stap voor stap naar de laatste pas, telkens wachten tot de beweging klaar is
    const settle = () => page.waitForFunction(() => new Promise<boolean>((res) => { const c = document.querySelector(".carousel") as HTMLElement; const a = c.scrollLeft; setTimeout(() => res(Math.abs(c.scrollLeft - a) < 0.5), 250); }), null, { timeout: 8000, polling: 300 });
    for (let k = 0; k < 3 && !(await page.locator("button[aria-label='Volgende pas']").isDisabled()); k++) {
      await settle();
      await page.click("button[aria-label='Volgende pas']");
    }
    await settle();
    await page.waitForFunction(() => document.querySelector(".counter")?.textContent === "Pas 3 van 3");
    expect(await page.locator("button[aria-label='Volgende pas']").isDisabled()).toBe(true);
    await shot(page, "carrousel-3");
    await page.click(".dot >> nth=0");
    await page.waitForFunction(() => document.querySelector(".counter")?.textContent === "Pas 1 van 3");
    expect(await page.locator("button[aria-label='Vorige pas']").isDisabled()).toBe(true);

    // toetsenbord
    await page.focus(".carousel");
    await settle();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".counter")?.textContent === "Pas 2 van 3");
    await settle();
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(() => document.querySelector(".counter")?.textContent === "Pas 1 van 3");

    // elke slide heeft een eigen QR en naam; toegankelijke labels
    const labels = await page.locator(".slide").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(labels).toEqual(["Pas 1 van 3: Derde Pas", "Pas 2 van 3: Eerste Pas", "Pas 3 van 3: Tweede Pas"] /* alfabetisch op naam */);
    expect(await page.locator(".slide .pass-qr svg").count()).toBe(3);
    // geen horizontale pagina-scroll op 393 px
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await ctx.close();
  });
});
