import "server-only";
import { PKPass } from "passkit-generator";
import { WALLET_ASSETS } from "./assets.generated";

export class WalletNotConfigured extends Error {
  constructor(public wallet: "apple" | "google", public missing: string[]) {
    super(`${wallet} wallet niet geconfigureerd: ${missing.join(", ")}`);
  }
}

const b64 = (v: string) => Buffer.from(v, "base64").toString("utf8");

export function appleConfig() {
  const e = process.env;
  const need = ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_SIGNER_CERT_BASE64", "APPLE_SIGNER_KEY_BASE64", "APPLE_WWDR_CERT_BASE64"];
  const missing = need.filter((k) => !e[k]);
  if (missing.length) throw new WalletNotConfigured("apple", missing);
  return {
    passTypeIdentifier: e.APPLE_PASS_TYPE_ID!,
    teamIdentifier: e.APPLE_TEAM_ID!,
    certificates: {
      wwdr: b64(e.APPLE_WWDR_CERT_BASE64!),
      signerCert: b64(e.APPLE_SIGNER_CERT_BASE64!),
      signerKey: b64(e.APPLE_SIGNER_KEY_BASE64!),
      signerKeyPassphrase: e.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
    },
  };
}

/**
 * Genereert een ondertekende .pkpass. De QR bevat uitsluitend de opaque token; op de pas staan alleen
 * naam en lidnummer. Er is bewust géén altText (zou de token tonen) en geen persoonsgegevens in de barcode.
 * Intrekking wordt NIET via Wallet afgedwongen: de online scanner is leidend.
 */
export async function buildApplePass(input: { passId: string; name: string; memberNumber: string; token: string }): Promise<Buffer> {
  const cfg = appleConfig();
  const files: Record<string, Buffer> = {};
  for (const [name, data] of Object.entries(WALLET_ASSETS)) files[name] = Buffer.from(data, "base64");
  files["pass.json"] = Buffer.from(JSON.stringify({ formatVersion: 1 }));
  const pass = new PKPass(files, cfg.certificates, {
    serialNumber: input.passId, // pas-id, niet de token
    passTypeIdentifier: cfg.passTypeIdentifier,
    teamIdentifier: cfg.teamIdentifier,
    organizationName: "HHC ClubSupport",
    description: "Ledenpas HHC ClubSupport",
    logoText: "ClubSupport",
    backgroundColor: "rgb(0, 0, 0)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(255, 102, 0)",
  });
  pass.type = "generic";
  pass.primaryFields.push({ key: "name", label: "LID", value: input.name });
  pass.secondaryFields.push({ key: "memberNumber", label: "LIDNUMMER", value: input.memberNumber });
  pass.backFields.push({ key: "info", label: "Let op", value: "De geldigheid van deze pas wordt altijd online gecontroleerd. Een gedeactiveerde of ingetrokken pas is direct ongeldig." });
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: input.token, messageEncoding: "iso-8859-1" });
  return pass.getAsBuffer();
}
