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
  await ctx.internalAdapter.linkAccount({ userId: "adm", providerId: "credential", accountId: "adm", password: hash });
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

  it("zoeken op naam en lidnummer: status per lid; zonder verbinding niet gecontroleerd", async () => {
    const { ctx, page } = await scannerPage("Pixel 5");
    await page.fill("#q", "ann");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("text=PAS ACTIEF");
    expect(await page.locator("ul li").first().innerText()).toContain("Anna 21");
    expect(await page.locator("ul li").first().innerText()).toContain("T21");
    await shot(page, "scanner-zoeken");
    await page.fill("#q", "T21");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("li:has-text('T21')");
    await page.fill("#q", "niemandbestaat");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("text=Geen lid gevonden");
    // fout/offline: nooit een status tonen
    await page.route("**/api/scan/lookup", (r) => r.abort("internetdisconnected"));
    await page.fill("#q", "anna");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
    expect(await page.locator("text=PAS ACTIEF").count()).toBe(0);
    await page.unroute("**/api/scan/lookup");
    await page.route("**/api/scan/lookup", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tooMany: false, results: [{ name: "X", memberNumber: "1", pass: "valid" }] }) }));
    await page.fill("#q", "anna");
    await page.click("button:has-text('Zoeken')");
    await page.waitForSelector("text=NIET GECONTROLEERD");
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

  it("toegankelijkheid (axe, WCAG 2.1 AA): geen overtredingen op de kernschermen", async () => {
    const axeSrc = (await import("node:fs")).readFileSync(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const problems: string[] = [];
    const check = async (page: import("playwright-core").Page, name: string) => {
      await page.waitForTimeout(300);
      await page.evaluate(axeSrc);
      const res = await page.evaluate(async () => {
        // @ts-expect-error axe wordt ingeladen
        const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
        return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(" ") + " :: " + (n.any[0]?.message ?? n.failureSummary ?? "").slice(0, 140)) }));
      });
      for (const v of res) problems.push(`${name}: ${v.id} (${v.impact}) ${v.nodes.join(" | ")}`);
    };
    const mk = (device: keyof typeof devices) => browser.newContext({ ...devices[device], bypassCSP: true, reducedMotion: "reduce" });
    // Controle dat de axe-opstelling echt iets vindt (anders zegt "geen overtredingen" niets).
    {
      const c = await mk("Pixel 5");
      const pc = await c.newPage();
      await pc.setContent('<html lang="nl"><body><main><img src="x.png"><p style="color:#ff6600;background:#fff">Laag contrast</p><input></main></body></html>');
      await check(pc, "controle");
      await c.close();
      expect(problems.some((x) => x.includes("image-alt")) && problems.some((x) => x.includes("color-contrast")) && problems.some((x) => x.includes("label")), `axe-controle werkt niet: ${problems.join(" / ")}`).toBe(true);
      problems.length = 0;
    }
    const login = async (page: import("playwright-core").Page, area: string, email: string) => {
      await resetLoginLimit();
      await page.goto(`${BASE}/${area}/inloggen`);
      await page.fill("#email", email);
      await page.fill("#password", "een-lang-wachtwoord-1");
      await page.click("button:has-text('Inloggen')");
      await page.waitForURL((u) => !u.pathname.includes("inloggen"), { timeout: 20000 });
    };
    for (const device of ["Pixel 5", "Desktop Chrome"] as const) {
      const tag = device === "Pixel 5" ? "mobiel" : "desktop";
      const pub = await mk(device);
      const p0 = await pub.newPage();
      for (const [n, u] of [["login-lid", "/ledenpas/inloggen"], ["login-scanner", "/scanner/inloggen"], ["login-beheer", "/beheer/inloggen"], ["vergeten", "/wachtwoord-vergeten"], ["activeren-ongeldig", "/activeren?token=ongeldig"], ["wachtwoord-resetten-ongeldig", "/wachtwoord-resetten?token=ongeldig"]]) {
        await p0.goto(BASE + u);
        await check(p0, `${tag} ${n}`);
      }
      await pub.close();

      const lid = await mk(device);
      const pl = await lid.newPage();
      await login(pl, "ledenpas", "fam@example.test");
      await check(pl, `${tag} ledenpas (3 passen)`);
      await lid.close();

      const sc = await mk(device);
      const ps = await sc.newPage();
      await login(ps, "scanner", "scn@example.test");
      await check(ps, `${tag} scanner`);
      await ps.fill("#q", "anna");
      await ps.click("button:has-text('Zoeken')");
      await ps.waitForSelector("li:has-text('PAS ')");
      await check(ps, `${tag} scanner zoekresultaat`);
      await ps.fill("#code", "A".repeat(43));
      await ps.click("button:has-text('Controleren')");
      await ps.waitForSelector("section[role=alert]");
      await check(ps, `${tag} scanner-resultaat ongeldig`);
      await ps.route("**/api/scan", (r) => r.abort());
      await ps.click("button:has-text('Volgende scan')").catch(() => undefined);
      await ps.fill("#code", "x");
      await ps.click("button:has-text('Controleren')");
      await ps.waitForSelector("text=NIET GECONTROLEERD");
      await check(ps, `${tag} scanner-resultaat niet gecontroleerd`);
      await sc.close();

      const bh = await mk(device);
      const pb = await bh.newPage();
      await login(pb, "beheer", "adm@example.test");
      await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, "adm"));
      const [m] = await db.select().from(schema.member).limit(1);
      for (const [n, u] of [["overzicht", "/beheer"], ["leden", "/beheer/leden"], ["nieuw lid", "/beheer/leden/nieuw"], ["lid", `/beheer/leden/${m.id}?msg=Gelukt`], ["lid foutmelding", `/beheer/leden/${m.id}?err=Fout`], ["import", "/beheer/import"]]) {
        await pb.goto(BASE + u);
        await check(pb, `${tag} beheer ${n}`);
      }
      await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, "adm"));
      await bh.close();
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("ledenpas offline kopie (online gedrag): opslaan, verversen bij online bezoek, verlopen, aan/uit en wissen bij uitloggen", async () => {
    await resetLoginLimit();
    const ctx = await browser.newContext({ ...devices["Pixel 5"], reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ledenpas/inloggen`);
    await page.fill("#email", "fam@example.test");
    await page.fill("#password", "een-lang-wachtwoord-1");
    await page.click("button:has-text('Inloggen')");
    await page.waitForURL("**/ledenpas");
    await page.waitForSelector(".carousel .slide");
    await page.waitForFunction(() => !!localStorage.getItem("hhc-ledenpas-offline-v1"));
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem("hhc-ledenpas-offline-v1")))!);
    expect(stored.items.map((i: { name: string }) => i.name)).toEqual(["Derde Pas", "Eerste Pas", "Tweede Pas"]);
    expect(JSON.stringify(stored)).not.toMatch(/@|fam@example/); // geen e-mailadres in de kopie

    // online verversen: een gedeactiveerde pas is daarna geen actieve pas (zonder QR) in de kopie
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { deactivatePass, reactivatePass } = await import("@/server/passes");
    const [row] = await db.select().from(schema.member).where(eq(schema.member.fullName, "Eerste Pas"));
    const [p] = await db.select().from(schema.pass).where(eq(schema.pass.memberId, row.id));
    await deactivatePass(p.id, "adm", "test");
    await page.goto(`${BASE}/ledenpas`);
    await page.waitForFunction(() => { const d = JSON.parse(localStorage.getItem("hhc-ledenpas-offline-v1") || "{}"); return d.items?.find((i: { name: string; active: boolean; svg: string | null }) => i.name === "Eerste Pas" && !i.active && i.svg === null); }, null, { timeout: 10000 });
    await reactivatePass(p.id, "adm", "terug");

    // verlopen kopie wordt niet getoond en gewist
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("hhc-ledenpas-offline-v1")!); d.savedAt = Date.now() - 40 * 86400_000; localStorage.setItem("hhc-ledenpas-offline-v1", JSON.stringify(d)); });
    await page.goto(`${BASE}/ledenpas/offline`);
    await page.waitForSelector("text=Offline kopie verlopen");
    expect(await page.evaluate(() => localStorage.getItem("hhc-ledenpas-offline-v1"))).toBeNull();

    // uitzetten wist de kopie en blijft uit; aanzetten bewaart weer
    await page.goto(`${BASE}/ledenpas`);
    await page.waitForFunction(() => !!localStorage.getItem("hhc-ledenpas-offline-v1"));
    await page.uncheck("input[type=checkbox]");
    expect(await page.evaluate(() => localStorage.getItem("hhc-ledenpas-offline-v1"))).toBeNull();
    await page.reload();
    await page.waitForSelector(".carousel .slide");
    expect(await page.evaluate(() => localStorage.getItem("hhc-ledenpas-offline-v1"))).toBeNull();
    await page.check("input[type=checkbox]");
    await page.waitForFunction(() => !!localStorage.getItem("hhc-ledenpas-offline-v1"));

    // uitloggen wist de kopie
    await page.click("button:has-text('Uitloggen')");
    await page.waitForURL("**/ledenpas/inloggen");
    expect(await page.evaluate(() => localStorage.getItem("hhc-ledenpas-offline-v1"))).toBeNull();
    await ctx.close();
  });

  // LET OP: deze test moet de LAATSTE in dit bestand blijven: hij stopt de server om echt offline te zijn.
  it("ledenpas zonder internet: na inloggen blijven de passen bekijkbaar (server uitgeschakeld)", async () => {
    await resetLoginLimit();
    const ctx = await browser.newContext({ ...devices["Pixel 5"], reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ledenpas/inloggen`);
    await page.fill("#email", "fam@example.test");
    await page.fill("#password", "een-lang-wachtwoord-1");
    await page.click("button:has-text('Inloggen')");
    await page.waitForURL("**/ledenpas");
    await page.waitForSelector(".carousel .slide");
    // service worker actief, offline-pagina + bestanden in de cache, kopie opgeslagen
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/ledenpas");
      if (reg?.active?.state !== "activated" || !navigator.serviceWorker.controller) return false; // echt actief en pagina onder controle
      const c = await caches.open("ledenpas-shell-v2");
      const keys = await c.keys();
      // de eindmarkering wordt pas gezet als de offline-pagina én alle bestanden zijn opgehaald
      return keys.some((k) => k.url.endsWith("/__offline-stamp")) && keys.some((k) => k.url.endsWith("/ledenpas/offline")) && !!localStorage.getItem("hhc-ledenpas-offline-v1");
    }, null, { timeout: 20000, polling: 500 });

    // Chromium neemt navigaties van een nieuwe service worker pas na een paar seconden over (gemeten: 0/3 zonder, 3/3 met 3 s wachten).
    await page.waitForTimeout(3000);
    // server stoppen = echt geen verbinding
    if (server?.pid) process.kill(-server.pid, "SIGTERM");
    for (let i = 0; i < 40; i++) {
      try {
        await fetch(`${BASE}/api/health`);
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await page.goto(`${BASE}/ledenpas`);
    await page.waitForSelector("text=Je bent offline", { timeout: 15000 });
    expect(await page.locator(".carousel .slide").count()).toBe(3);
    expect(await page.locator(".slide .pass-qr svg").count()).toBe(3);
    expect(await page.locator("text=Derde Pas").count()).toBeGreaterThan(0);
    await shot(page, "ledenpas-offline");
    // het lettertype en logo komen uit de cache; geen horizontale scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const faces = await page.evaluate(async () => {
      const a = await document.fonts.load("400 16px DIN");
      const b = await document.fonts.load("300 24px DIN");
      return a.length + b.length;
    });
    expect(faces, "DIN-lettertype uit de cache geladen").toBeGreaterThan(0);
    // de inlog-URL valt ook veilig terug (kopie staat er nog)
    await page.goto(`${BASE}/ledenpas/inloggen`);
    await page.waitForSelector("text=Je bent offline");
    await ctx.close();
  });
});
