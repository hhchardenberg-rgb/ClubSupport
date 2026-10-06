/** Server-side omgevingsvariabelen. Nooit importeren vanuit client-componenten. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Omgevingsvariabele ${name} ontbreekt (zie .env.example)`);
  return v;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get tokenHmacKey() {
    return Buffer.from(required("TOKEN_HMAC_KEY"), "base64");
  },
  get tokenEncKey() {
    const k = Buffer.from(required("TOKEN_ENC_KEY"), "base64");
    if (k.length !== 32) throw new Error("TOKEN_ENC_KEY moet 32 bytes (base64) zijn");
    return k;
  },
  get emailMode(): "live" | "test" | "disabled" {
    const m = process.env.EMAIL_MODE ?? "test";
    return m === "live" || m === "disabled" ? m : "test";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  scanRetentionDays: Number(process.env.SCAN_RETENTION_DAYS ?? 90),
  auditRetentionDays: Number(process.env.AUDIT_RETENTION_DAYS ?? 730),
  deletedMemberRetentionDays: Number(process.env.DELETED_MEMBER_RETENTION_DAYS ?? 90),
  /** Bewaartermijn van verzendregels van nieuwsbrieven (per e-mailadres); daarna werkt de afmeldlink uit die mail niet meer. */
  newsletterDeliveryRetentionDays: Number(process.env.NEWSLETTER_DELIVERY_RETENTION_DAYS ?? 730),
  requireMfaForScanner: process.env.REQUIRE_MFA_SCANNER === "true",
  /** Hoe lang de offline kopie van passen op het toestel van een lid bruikbaar blijft. */
  offlinePassMaxDays: Math.min(90, Math.max(1, Number(process.env.OFFLINE_PASS_MAX_DAYS ?? 30) || 30)),
};
