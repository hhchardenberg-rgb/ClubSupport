import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const req = (host: string, path = "/beheer/inloggen?x=1") => new NextRequest(`https://${host}${path}`, { headers: { host } });

describe("proxy: oude hostnamen sturen door naar APP_URL", () => {
  afterEach(() => {
    delete process.env.REDIRECT_HOSTS;
    process.env.APP_URL = "http://localhost:3000";
  });

  it("stuurt een oude host permanent door met pad en query", () => {
    process.env.APP_URL = "https://ledenpas.example.test";
    process.env.REDIRECT_HOSTS = "oud.example.test, nog-ouder.example.test";
    const res = proxy(req("oud.example.test"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://ledenpas.example.test/beheer/inloggen?x=1");
  });

  it("laat het vaste adres en onbekende hosts met rust", () => {
    process.env.APP_URL = "https://ledenpas.example.test";
    process.env.REDIRECT_HOSTS = "oud.example.test";
    expect(proxy(req("ledenpas.example.test")).status).toBe(200);
    expect(proxy(req("preview.example.test")).status).toBe(200);
  });

  it("doet niets zonder REDIRECT_HOSTS", () => {
    process.env.APP_URL = "https://ledenpas.example.test";
    expect(proxy(req("oud.example.test")).status).toBe(200);
  });
});
