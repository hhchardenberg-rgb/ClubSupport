import "server-only";

/** Welke Wallet-integraties zijn geconfigureerd? Nooit waarden teruggeven, alleen beschikbaarheid. */
export function walletStatus() {
  const e = process.env;
  const apple = !!(e.APPLE_PASS_TYPE_ID && e.APPLE_TEAM_ID && e.APPLE_SIGNER_CERT_BASE64 && e.APPLE_SIGNER_KEY_BASE64 && e.APPLE_WWDR_CERT_BASE64);
  const google = !!(e.GOOGLE_WALLET_ISSUER_ID && e.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64);
  return { apple, google };
}
