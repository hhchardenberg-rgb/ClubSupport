import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;
const cookies: Record<string, string> = {};

process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.TOKEN_HMAC_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.TOKEN_ENC_KEY ??= Buffer.alloc(32, 9).toString("base64");

async function get(path: string, who?: string) {
  const res = await fetch(BASE + path, { redirect: "manual", headers: who ? { cookie: cookies[who] } : {} });
  return { status: res.status, location: res.headers.get("location") ?? "", text: res.status === 200 ? await res.text() : "" };
}

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ email, password: "een-lang-wachtwoord-1" }) });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

beforeAll(async () => {
  const { db, schema } = await import("@/db");
  const { auth } = await import("@/lib/auth");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash("een-lang-wachtwoord-1");
  await db.execute((await import("drizzle-orm")).sql`truncate rate_limit`); // eerdere testbestanden hebben de inlogbegrenzing gebruikt
  for (const [id, role] of [["member", "member"], ["scanner", "scanner"], ["manager", "manager"], ["sysadmin", "sysadmin"]] as const) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role, emailVerified: true });
    await ctx.internalAdapter.linkAccount({ userId: id, providerId: "credential", accountId: id, password: hash });
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, APP_URL: BASE, BETTER_AUTH_URL: BASE, EMAIL_MODE: "disabled" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const id of ["member", "scanner", "manager", "sysadmin"]) cookies[id] = await login(`${id}@example.test`);
  // MFA-status pas na de login zetten (sessie blijft geldig).
  await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, "manager"));
}, 120000);

afterAll(() => {
  // Hele procesgroep stoppen (npx start een kindproces); anders blijft een oude server hangen.
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
});

describe("autorisatie per route (test 9 en server-side controle)", () => {
  it("zonder sessie: beheer en ledenpas sturen naar inloggen", async () => {
    expect((await get("/beheer/leden")).location).toContain("/beheer/inloggen");
    expect((await get("/beheer/leden/nieuw")).location).toContain("/beheer/inloggen");
    expect((await get("/ledenpas")).location).toContain("/ledenpas/inloggen");
  });

  it("lid heeft geen toegang tot beheer", async () => {
    for (const p of ["/beheer", "/beheer/leden", "/beheer/import", "/beheer/accounts", "/beheer/audit", "/beheer/controlelogboek"]) expect((await get(p, "member")).location, p).toContain("/beheer/geen-toegang");
  });

  it("scanner-rol kan niet naar ledenbeheer, import, accounts of audit", async () => {
    for (const p of ["/beheer", "/beheer/leden", "/beheer/leden/nieuw", "/beheer/import", "/beheer/accounts", "/beheer/audit", "/beheer/controlelogboek"]) expect((await get(p, "scanner")).location, p).toContain("/beheer/geen-toegang");
  });

  it("ledenbeheerder: leden/import ja, accounts en audit nee", async () => {
    for (const p of ["/beheer", "/beheer/leden", "/beheer/leden/nieuw", "/beheer/import", "/beheer/controlelogboek"]) expect((await get(p, "manager")).status, p).toBe(200);
    for (const p of ["/beheer/accounts", "/beheer/audit"]) expect((await get(p, "manager")).location, p).toContain("/beheer/geen-toegang");
  });

  it("beheerrol zonder MFA wordt naar MFA-inrichting gestuurd; met MFA krijgt systeembeheer alles", async () => {
    expect((await get("/beheer/leden", "sysadmin")).location).toContain("/beheer/mfa-instellen");
    const { db, schema } = await import("@/db");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, "sysadmin"));
    for (const p of ["/beheer", "/beheer/leden", "/beheer/accounts", "/beheer/audit", "/beheer/import", "/beheer/controlelogboek"]) expect((await get(p, "sysadmin")).status, p).toBe(200);
  });

  it("geblokkeerd account heeft direct geen toegang meer", async () => {
    const { db, schema } = await import("@/db");
    await db.update(schema.user).set({ disabledAt: new Date() }).where(eq(schema.user.id, "manager"));
    expect((await get("/beheer/leden", "manager")).location).toContain("/beheer/inloggen");
    await db.update(schema.user).set({ disabledAt: null }).where(eq(schema.user.id, "manager"));
  });

  it("hoofdpagina verwijst alleen naar Ledenpas; Scanner/Beheer komen niet in de HTML voor", async () => {
    const r = await get("/ledenpas/inloggen");
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/Scanner|Beheer|\/scanner|\/beheer/);
    const home = await fetch(BASE + "/", { redirect: "manual" });
    expect(home.headers.get("location")).toContain("/ledenpas");
  });

  it("eigen POST-routes weigeren verzoeken zonder eigen Origin (CSRF)", async () => {
    for (const p of ["/api/account/activate", "/api/account/reset", "/api/account/reset-request"]) {
      const res = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(res.status, p).toBe(403);
    }
  });

  it("security headers staan op elke pagina", async () => {
    const res = await fetch(BASE + "/ledenpas/inloggen");
    expect(res.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });
});

describe("scan-endpoint (tests 2, 7, 9)", () => {
  async function scan(who: string | undefined, code: unknown, origin: string | null = BASE) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (who) headers.cookie = cookies[who];
    if (origin) headers.Origin = origin;
    const res = await fetch(`${BASE}/api/scan`, { method: "POST", headers, body: JSON.stringify({ code }) });
    return { status: res.status, body: await res.json().catch(() => null), cache: res.headers.get("cache-control") };
  }

  it("zonder sessie, als lid of zonder eigen Origin: geen scan", async () => {
    expect((await scan(undefined, "x")).status).toBe(401);
    expect((await scan("member", "x")).status).toBe(401);
    expect((await scan("scanner", "x", null)).status).toBe(403);
    expect((await scan("scanner", "x", "https://evil.example")).status).toBe(403);
  });

  it("controleur scant: geldig toont alleen naam en lidnummer; wijzigingen werken direct; antwoorden niet cachebaar", async () => {
    const { db, schema } = await import("@/db");
    const { makeMember, tokenOf } = await import("../tests/helpers");
    const { deactivatePass, reissuePass } = await import("@/server/passes");
    const { passId, member } = await makeMember(1, "Eva");
    const token = (await tokenOf(passId))!;
    const ok = await scan("scanner", token);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ outcome: "valid", name: "Eva 1", memberNumber: "T1" });
    expect(ok.cache).toContain("no-store");
    await deactivatePass(passId, "manager", "test");
    expect((await scan("scanner", token)).body.outcome).toBe("inactive");
    await reissuePass(member.id, "manager", "lost", "kwijt");
    expect((await scan("scanner", token)).body).toEqual({ outcome: "revoked" });
    // onbekend / gemanipuleerd / misvormd: generiek, zonder gegevens
    for (const bad of ["A".repeat(43), token.slice(0, -1) + "A", "kort", "", null, { x: 1 }]) expect((await scan("scanner", bad)).body).toEqual({ outcome: "unknown" });
    // scanlog zonder ruwe token
    expect(JSON.stringify(await db.select().from(schema.scanEvent))).not.toContain(token);
  });

  it("te veel scans worden begrensd (429, rate_limited)", async () => {
    let limited = 0;
    for (let i = 0; i < 70; i++) if ((await scan("manager", "A".repeat(43))).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
});

describe("ledentoegang (tests 3, 11)", () => {
  it("lid ziet alleen eigen gekoppelde passen; andermans pas verschijnt niet", async () => {
    const { db, schema } = await import("@/db");
    const { makeMember } = await import("../tests/helpers");
    const mine = await makeMember(11, "Mijn Lid");
    await makeMember(12, "Ander Lid");
    await db.insert(schema.accountMemberAccess).values({ userId: "member", memberId: mine.member.id, grantedBy: "manager" });
    const html = await (await fetch(BASE + "/ledenpas", { headers: { cookie: cookies.member } })).text();
    expect(html).toContain("Mijn Lid 11");
    expect(html).not.toContain("Ander Lid 12");
    expect(html).not.toMatch(/Wallet/);
  });

  it("gedeactiveerde pas toont geen QR", async () => {
    const { db, schema } = await import("@/db");
    const { makeMember } = await import("../tests/helpers");
    const { deactivatePass } = await import("@/server/passes");
    const m = await makeMember(13, "Gedeactiveerd Lid");
    await db.insert(schema.accountMemberAccess).values({ userId: "member", memberId: m.member.id, grantedBy: "manager" });
    await deactivatePass(m.passId, "manager", "test");
    const html = await (await fetch(BASE + "/ledenpas", { headers: { cookie: cookies.member } })).text();
    expect(html).toContain("niet actief");
  });
});

describe("zoeken door de controleur en controlelogboek (e2e)", () => {
  async function post(path: string, who: string | undefined, body: unknown, origin: string | null = BASE) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (who) headers.cookie = cookies[who];
    if (origin) headers.Origin = origin;
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null), cache: res.headers.get("cache-control") };
  }

  it("zonder sessie, als lid of zonder eigen Origin: geen zoekresultaten", async () => {
    expect((await post("/api/scan/lookup", undefined, { q: "anna" })).status).toBe(401);
    expect((await post("/api/scan/lookup", "member", { q: "anna" })).status).toBe(401);
    expect((await post("/api/scan/lookup", "scanner", { q: "anna" }, null)).status).toBe(403);
    expect((await post("/api/scan/lookup", "scanner", { q: "anna" }, "https://evil.example")).status).toBe(403);
  });

  it("controleur zoekt op naam en lidnummer; antwoord is minimaal en niet cachebaar", async () => {
    const { makeMember } = await import("../tests/helpers");
    await makeMember(41, "Zoekbaar");
    const byName = await post("/api/scan/lookup", "scanner", { q: "zoekb" });
    expect(byName.status).toBe(200);
    expect(byName.body).toEqual({ ok: true, tooMany: false, results: [{ name: "Zoekbaar 41", memberNumber: "T41", pass: "active" }] });
    expect(byName.cache).toContain("no-store");
    expect((await post("/api/scan/lookup", "scanner", { q: "T41" })).body.results[0].memberNumber).toBe("T41");
    expect(JSON.stringify(byName.body)).not.toMatch(/@|email/i);
    expect((await post("/api/scan/lookup", "scanner", { q: "" })).status).toBe(400);
  });

  it("controlelogboek toont de handelingen van de controleur voor beheer", async () => {
    const html = await (await fetch(`${BASE}/beheer/controlelogboek?outcome=lookup`, { headers: { cookie: cookies.manager } })).text();
    expect(html).toContain("Controlelogboek");
    expect(html).toContain("Zoekopdracht");
    const all = await (await fetch(`${BASE}/beheer/controlelogboek`, { headers: { cookie: cookies.sysadmin } })).text();
    expect(all).toMatch(/Geldig|Onbekende code/);
  });
});

describe("ledenadministratie (e2e): lidmaatschap, export, koppelingen", () => {
  async function postForm(path: string, who: string | undefined, fields: Record<string, string>, origin: string | null = BASE) {
    const headers: Record<string, string> = {};
    if (who) headers.cookie = cookies[who];
    if (origin) headers.Origin = origin;
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: new URLSearchParams(fields) });
    return { status: res.status, text: await res.text(), type: res.headers.get("content-type") ?? "", disp: res.headers.get("content-disposition") ?? "", cache: res.headers.get("cache-control") ?? "" };
  }
  const scanApi = async (token: string) => (await (await fetch(`${BASE}/api/scan`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, cookie: cookies.scanner }, body: JSON.stringify({ code: token }) })).json()) as Record<string, unknown>;

  it("een scan met beëindigd lidmaatschap is ongeldig en geeft alleen naam en lidnummer terug; zoeken toont het ook", async () => {
    const { makeMember, tokenOf } = await import("../tests/helpers");
    const { changeMembership } = await import("@/server/memberships");
    const m = await makeMember(51, "Beeindigd");
    const token = (await tokenOf(m.passId))!;
    expect((await scanApi(token)).outcome).toBe("valid");
    await changeMembership("manager", m.member.id, "end", { reason: "opgezegd door lid" });
    expect(await scanApi(token)).toEqual({ outcome: "membership_invalid", name: "Beeindigd 51", memberNumber: "T51" });
    const res = await (await fetch(`${BASE}/api/scan/lookup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, cookie: cookies.scanner }, body: JSON.stringify({ q: "T51" }) })).json();
    expect(res.results[0]).toEqual({ name: "Beeindigd 51", memberNumber: "T51", pass: "membership" });
    await changeMembership("manager", m.member.id, "activate", { startDate: "", reason: "heraanmelding" });
    expect((await scanApi(token)).outcome).toBe("valid"); // dezelfde pas, nieuw lidmaatschap
  });

  it("de ledenomgeving toont lidmaatschapsstatus per lid en geen QR bij een niet-geldig lidmaatschap", async () => {
    const { db, schema } = await import("@/db");
    const { makeMember } = await import("../tests/helpers");
    const { changeMembership } = await import("@/server/memberships");
    const a = await makeMember(61, "Geldig Gezinslid");
    const b = await makeMember(62, "Geschorst Gezinslid");
    for (const m of [a, b]) await db.insert(schema.accountMemberAccess).values({ userId: "member", memberId: m.member.id, grantedBy: "manager" });
    await changeMembership("manager", b.member.id, "suspend", { reason: "onderzoek" });
    const html = await (await fetch(BASE + "/ledenpas", { headers: { cookie: cookies.member } })).text();
    expect(html).toContain("Geldig Gezinslid 61");
    expect(html).toContain("Geschorst Gezinslid 62");
    expect(html).toContain("Geschorst"); // lidmaatschapsstatus zichtbaar
    expect(html).toContain("Gekoppelde leden");
    expect(html).not.toContain("onderzoek"); // geen interne reden of notities naar leden
    expect((html.match(/aria-label="QR-code van de ledenpas/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain("QR-code van de ledenpas van Geschorst Gezinslid"); // geen QR bij geschorst lidmaatschap
    expect(html).toContain("QR-code van de ledenpas van Geldig Gezinslid");
  });

  it("export: alleen met recht, eigen Origin en POST; CSV zonder tokens, formules geneutraliseerd en geaudit", async () => {
    const { db, schema } = await import("@/db");
    const { makeMember, tokenOf } = await import("../tests/helpers");
    const m = await makeMember(71, "=HYPERLINK(1)");
    const token = (await tokenOf(m.passId))!;
    expect((await postForm("/api/beheer/export", undefined, {})).status).toBe(401);
    expect((await postForm("/api/beheer/export", "member", {})).status).toBe(401);
    expect((await postForm("/api/beheer/export", "scanner", {})).status).toBe(401);
    expect((await postForm("/api/beheer/export", "manager", {}, null)).status).toBe(403);
    expect((await postForm("/api/beheer/export", "manager", {}, "https://evil.example")).status).toBe(403);
    expect((await fetch(`${BASE}/api/beheer/export`, { headers: { cookie: cookies.manager } })).status).toBe(405);
    const ok = await postForm("/api/beheer/export", "manager", { q: "T71" });
    expect(ok.status).toBe(200);
    expect(ok.type).toContain("text/csv");
    expect(ok.disp).toContain("attachment");
    expect(ok.cache).toContain("no-store");
    expect(ok.text).toContain('"lidnummer"');
    expect(ok.text).toContain(`"'=HYPERLINK(1) 71"`.replace(" 71", " 71")); // formule-injectie geneutraliseerd
    expect(ok.text).not.toContain(token);
    const audit = (await db.select().from(schema.auditEvent)).filter((a) => a.action === "members.export");
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toMatch(/T71|HYPERLINK/); // geen persoonsgegevens in het audit-spoor
  });

  it("koppelingenpagina's: alleen met access.manage; een staf-id is geen ledenaccount; lidpagina toont lidmaatschap en historie", async () => {
    const { db, schema } = await import("@/db");
    const { makeMember } = await import("../tests/helpers");
    expect((await get("/beheer/ledenaccounts", "scanner")).location).toContain("/beheer/geen-toegang");
    expect((await get("/beheer/ledenaccounts", "member")).location).toContain("/beheer/geen-toegang");
    expect((await get("/beheer/ledenaccounts", "manager")).status).toBe(200);
    expect((await get("/beheer/ledenaccounts/scanner", "manager")).status).toBe(404); // staf-account wordt niet getoond
    expect((await get("/beheer/ledenaccounts/member", "manager")).status).toBe(200);
    const m = await makeMember(81, "Detail Lid");
    const page = await get(`/beheer/leden/${m.member.id}`, "manager");
    expect(page.status).toBe(200);
    expect(page.text).toContain("Lidmaatschap");
    expect(page.text).toContain("Historie");
    // lid/scanner kunnen een ledenpagina niet direct opvragen (IDOR)
    for (const who of ["member", "scanner"]) expect((await get(`/beheer/leden/${m.member.id}`, who)).location).toContain("/beheer/geen-toegang");
    void db; void schema;
  });

  it("ledenlijst filtert op lidmaatschap en archief; gearchiveerde leden staan niet in de standaardlijst", async () => {
    const { makeMember } = await import("../tests/helpers");
    const { archiveMember, changeMembership } = await import("@/server/memberships");
    const a = await makeMember(91, "Archiefkandidaat");
    const e = await makeMember(92, "Eindkandidaat");
    await archiveMember(a.member.id, "manager", "archief test");
    await changeMembership("manager", e.member.id, "end", { reason: "einde test" });
    const std = await get("/beheer/leden?q=kandidaat", "manager");
    expect(std.text).toContain("Eindkandidaat 92");
    expect(std.text).not.toContain("Archiefkandidaat 91");
    expect((await get("/beheer/leden?q=kandidaat&status=gearchiveerd", "manager")).text).toContain("Archiefkandidaat 91");
    const ended = (await get("/beheer/leden?q=kandidaat&lidmaatschap=ended", "manager")).text;
    expect(ended).toContain("Eindkandidaat 92");
  });
});
