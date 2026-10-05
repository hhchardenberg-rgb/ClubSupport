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
  for (const [id, role] of [["member", "member"], ["scanner", "scanner"], ["manager", "manager"], ["sysadmin", "sysadmin"]] as const) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role, emailVerified: true });
    await ctx.internalAdapter.linkAccount({ userId: id, providerId: "credential", accountId: id, password: hash });
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, APP_URL: BASE, BETTER_AUTH_URL: BASE, EMAIL_MODE: "disabled" }, stdio: "ignore" });
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
  server?.kill();
});

describe("autorisatie per route (test 9 en server-side controle)", () => {
  it("zonder sessie: beheer en ledenpas sturen naar inloggen", async () => {
    expect((await get("/beheer/leden")).location).toContain("/beheer/inloggen");
    expect((await get("/beheer/leden/nieuw")).location).toContain("/beheer/inloggen");
    expect((await get("/ledenpas")).location).toContain("/ledenpas/inloggen");
  });

  it("lid heeft geen toegang tot beheer", async () => {
    for (const p of ["/beheer", "/beheer/leden", "/beheer/import", "/beheer/personeel", "/beheer/audit"]) expect((await get(p, "member")).location, p).toContain("/beheer/geen-toegang");
  });

  it("scanner-rol kan niet naar ledenbeheer, import, personeel of audit", async () => {
    for (const p of ["/beheer", "/beheer/leden", "/beheer/leden/nieuw", "/beheer/import", "/beheer/personeel", "/beheer/audit"]) expect((await get(p, "scanner")).location, p).toContain("/beheer/geen-toegang");
  });

  it("ledenbeheerder: leden/import ja, personeel en audit nee", async () => {
    for (const p of ["/beheer", "/beheer/leden", "/beheer/leden/nieuw", "/beheer/import"]) expect((await get(p, "manager")).status, p).toBe(200);
    for (const p of ["/beheer/personeel", "/beheer/audit"]) expect((await get(p, "manager")).location, p).toContain("/beheer/geen-toegang");
  });

  it("beheerrol zonder MFA wordt naar MFA-inrichting gestuurd; met MFA krijgt systeembeheer alles", async () => {
    expect((await get("/beheer/leden", "sysadmin")).location).toContain("/beheer/mfa-instellen");
    const { db, schema } = await import("@/db");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, "sysadmin"));
    for (const p of ["/beheer", "/beheer/leden", "/beheer/personeel", "/beheer/audit", "/beheer/import"]) expect((await get(p, "sysadmin")).status, p).toBe(200);
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
