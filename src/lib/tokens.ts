import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** 32 bytes = 256 bits entropie uit CSPRNG, base64url (43 tekens). Bevat geen enkele betekenis. */
export function generatePassToken(): string {
  return randomBytes(32).toString("base64url");
}

export const PASS_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedPassToken(t: unknown): t is string {
  return typeof t === "string" && PASS_TOKEN_FORMAT.test(t);
}

/** HMAC-SHA256 met serversleutel: database-lookup zonder ruwe token. */
export function hashToken(token: string): string {
  return createHmac("sha256", env.tokenHmacKey).update(token).digest("hex");
}

/** Hash voor eenmalige activatie-/resetlinks (random 256 bit, dus SHA-256 volstaat). */
export function hashLinkToken(token: string): string {
  return createHmac("sha256", env.tokenHmacKey).update("link:" + token).digest("hex");
}

export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/** AES-256-GCM, AAD = pas-id zodat een ciphertext niet naar een andere pas kan worden verplaatst. */
export function encryptToken(token: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", env.tokenEncKey, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptToken(payload: string, aad: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Ongeldig tokenformaat");
  const d = createDecipheriv("aes-256-gcm", env.tokenEncKey, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
