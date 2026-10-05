import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decodeJwt, importSPKI, jwtVerify } from "jose";

// Google API's niet echt aanroepen.
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { request: async () => ({ data: {} }) };
    }
  },
}));

const APPLE_KEYS = ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_SIGNER_CERT_BASE64", "APPLE_SIGNER_KEY_BASE64", "APPLE_WWDR_CERT_BASE64", "APPLE_SIGNER_KEY_PASSPHRASE"];
const GOOGLE_KEYS = ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64"];
const dir = mkdtempSync(path.join(tmpdir(), "wallet-"));
const sh = (c: string) => execSync(c, { cwd: dir, stdio: "pipe" });
let signerCert = "", signerKey = "", wwdr = "", saKey = "", saPub = "";

beforeAll(() => {
  // Zelfgemaakte TESTcertificaten — geen echte Apple-certificaten.
  sh(`openssl req -x509 -newkey rsa:2048 -nodes -keyout s.key -out s.pem -subj "/CN=Test Signer/O=Test" -days 2`);
  sh(`openssl req -x509 -newkey rsa:2048 -nodes -keyout w.key -out w.pem -subj "/CN=Test WWDR/O=Test" -days 2`);
  sh(`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out sa.key && openssl rsa -in sa.key -pubout -out sa.pub`);
  const rd = (f: string) => readFileSync(path.join(dir, f), "utf8");
  signerCert = rd("s.pem");
  signerKey = rd("s.key");
  wwdr = rd("w.pem");
  saKey = rd("sa.key");
  saPub = rd("sa.pub");
});

afterEach(() => {
  for (const k of [...APPLE_KEYS, ...GOOGLE_KEYS]) delete process.env[k];
});

const input = { passId: "11111111-2222-3333-4444-555555555555", name: "Anna de Vries", memberNumber: "1001", token: "T".repeat(43) };

function zipEntry(buf: Buffer, name: string): Buffer | null {
  // Minimale zip-lezer (local file headers).
  let i = 0;
  while (i < buf.length - 30 && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8), csize = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), elen = buf.readUInt16LE(i + 28);
    const n = buf.toString("utf8", i + 30, i + 30 + nlen);
    const start = i + 30 + nlen + elen;
    if (n === name) return method === 0 ? buf.subarray(start, start + csize) : inflateRawSync(buf.subarray(start, start + csize));
    i = start + csize;
  }
  return null;
}

describe("Apple Wallet (test 10)", () => {
  it("zonder certificaten: duidelijke setup-melding met ontbrekende variabelen", async () => {
    const { buildApplePass, WalletNotConfigured } = await import("@/wallet/apple");
    const e = await buildApplePass(input).catch((x) => x);
    expect(e).toBeInstanceOf(WalletNotConfigured);
    expect(e.missing).toEqual(expect.arrayContaining(["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_SIGNER_CERT_BASE64"]));
    const { walletStatus } = await import("@/lib/wallet-config");
    expect(walletStatus()).toEqual({ apple: false, google: false });
  });

  it("met (test)certificaten: ondertekende .pkpass met QR = opaque token en zonder persoonsgegevens in de barcode", async () => {
    Object.assign(process.env, {
      APPLE_PASS_TYPE_ID: "pass.nl.test.ledenpas",
      APPLE_TEAM_ID: "TEAM123456",
      APPLE_SIGNER_CERT_BASE64: Buffer.from(signerCert).toString("base64"),
      APPLE_SIGNER_KEY_BASE64: Buffer.from(signerKey).toString("base64"),
      APPLE_WWDR_CERT_BASE64: Buffer.from(wwdr).toString("base64"),
    });
    const { buildApplePass } = await import("@/wallet/apple");
    const buf = await buildApplePass(input);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // zip
    const pass = JSON.parse(zipEntry(buf, "pass.json")!.toString());
    expect(pass.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: input.token });
    expect(pass.barcodes[0].altText).toBeUndefined();
    expect(pass.serialNumber).toBe(input.passId);
    expect(pass.passTypeIdentifier).toBe("pass.nl.test.ledenpas");
    expect(JSON.stringify(pass.barcodes)).not.toMatch(/Anna|1001|@/);
    expect(JSON.stringify(pass)).not.toContain("@"); // geen e-mailadres op de pas
    expect(zipEntry(buf, "signature")).not.toBeNull();
    expect(zipEntry(buf, "manifest.json")).not.toBeNull();
    expect(zipEntry(buf, "icon.png")).not.toBeNull();
    const { walletStatus } = await import("@/lib/wallet-config");
    expect(walletStatus().apple).toBe(true);
  });
});

describe("Google Wallet (test 10)", () => {
  it("zonder configuratie: duidelijke setup-melding", async () => {
    const { buildGoogleSaveUrl } = await import("@/wallet/google");
    const { WalletNotConfigured } = await import("@/wallet/apple");
    const e = await buildGoogleSaveUrl(input).catch((x) => x);
    expect(e).toBeInstanceOf(WalletNotConfigured);
    expect(e.missing).toContain("GOOGLE_WALLET_ISSUER_ID");
    process.env.GOOGLE_WALLET_ISSUER_ID = "123";
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from("geen json").toString("base64");
    expect((await buildGoogleSaveUrl(input).catch((x) => x)).missing[0]).toMatch(/ongeldig/);
  });

  it("officiële Generic Pass-JWT: RS256, klopt met service account, QR = opaque token, geen e-mail", async () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000000000001";
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify({ client_email: "wallet@test.iam.gserviceaccount.com", private_key: saKey })).toString("base64");
    process.env.APP_URL = "https://ledenpas.example.test";
    const { buildGoogleSaveUrl } = await import("@/wallet/google");
    const { url, objectId } = await buildGoogleSaveUrl(input);
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const jwt = url.split("/save/")[1];
    const { payload } = await jwtVerify(jwt, await importSPKI(saPub, "RS256"), { algorithms: ["RS256"] });
    expect(payload).toMatchObject({ iss: "wallet@test.iam.gserviceaccount.com", aud: "google", typ: "savetowallet", origins: ["https://ledenpas.example.test"] });
    const obj = (decodeJwt(jwt).payload as { genericObjects: Record<string, unknown>[] }).genericObjects[0] as Record<string, any>;
    expect(obj.barcode).toEqual({ type: "QR_CODE", value: input.token });
    expect(obj.id).toBe(objectId);
    expect(obj.id).not.toContain(input.token);
    expect(obj.classId).toBe("3388000000000000001.hhc_clubsupport_ledenpas");
    expect(JSON.stringify(obj)).not.toContain("@");
    expect(obj.header.defaultValue.value).toBe("Anna de Vries");
  });
});
